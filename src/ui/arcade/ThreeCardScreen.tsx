import { useEffect, useRef, useState } from 'react';
import { GameShell, CoachBox, ResultBanner, BetPicker } from './Shell';
import { useWallet } from './useWallet';
import { PlayingCard } from '../components/PlayingCard';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng } from '../../core/rng';
import { PAIR_PLUS, ANTE_BONUS, TC_NAMES_ES, tcDeal, tcOptimalPlay, tcScore, tcSettle, type TCResult, type TCRound } from '../../engine/threecard/threecard';
import { requestThreeCardEV } from '../../workers/aiClient';
import { fmtChips, fmtSignedChips } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();
const OUT_ES: Record<TCResult['outcome'], string> = { win: 'Le ganas al crupier', lose: 'Gana el crupier', push: 'Empate', fold: 'Te retiraste', noQualify: 'El crupier no califica' };

export function ThreeCardScreen() {
  const w = useWallet('trescartas');
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const [ante, setAnte] = useState(25);
  const [pp, setPp] = useState(0);
  const [round, setRound] = useState<TCRound | null>(null);
  const [res, setRes] = useState<TCResult | null>(null);
  const [ev, setEv] = useState<{ play: number; fold: number } | null>(null);
  const roundRef = useRef<TCRound | null>(null);
  const resRef = useRef<TCResult | null>(null);
  roundRef.current = round;
  resRef.current = res;
  const deciding = !!round && !res;

  const deal = () => {
    if (deciding || ante <= 0 || !w.debit(ante + pp)) return;
    const r = tcDeal(rng, ante, pp);
    setRound(r);
    setRes(null);
    setEv(null);
    play('card');
    void requestThreeCardEV(r.player).then((e) => { if (roundRef.current === r) setEv(e); }).catch(() => undefined);
    announce(`Tu mano: ${TC_NAMES_ES[tcScore(r.player).hand]}.`);
  };

  const finish = (r: TCRound, playIt: boolean, coachEv: { play: number; fold: number } | null, auto = false) => {
    if (playIt && !auto && !w.debit(r.ante)) return;
    const result = tcSettle(r, playIt);
    const wagered = r.ante + r.pairPlus + (playIt ? r.ante : 0);
    const returned = wagered + result.net;
    let coach: { good: boolean; evLoss: number } | undefined;
    if (coachEv) {
      const best = Math.max(coachEv.play, coachEv.fold);
      const chosen = playIt ? coachEv.play : coachEv.fold;
      coach = { good: best - chosen < 1e-9, evLoss: best - chosen };
    }
    w.settle(wagered, returned, `${TC_NAMES_ES[result.playerHand]} vs ${TC_NAMES_ES[result.dealerHand]} · ${OUT_ES[result.outcome]}`, coach);
    setRes(result);
    resRef.current = result;
    play(result.net > 0 ? 'win' : 'lose');
    announce(`${OUT_ES[result.outcome]}. ${result.net >= 0 ? 'Ganas' : 'Pierdes'} ${fmtChips(Math.abs(result.net))}.`);
  };

  // Si se sale sin decidir, se juega con la estrategia óptima (la ronda no se anula).
  useEffect(() => () => {
    const r = roundRef.current;
    if (r && !resRef.current) {
      const playIt = tcOptimalPlay(r.player);
      const result = tcSettle(r, playIt);
      const wagered = r.ante + r.pairPlus + (playIt ? r.ante : 0);
      w.settle(wagered, wagered + result.net, `${TC_NAMES_ES[result.playerHand]} (ronda completada automáticamente)`, undefined, playIt ? r.ante : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useHotkeys({ Enter: () => (deciding ? round && finish(round, true, ev) : deal()), j: () => deciding && round && finish(round, true, ev), f: () => deciding && round && finish(round, false, ev) });

  const ph = round ? tcScore(round.player).hand : null;
  const optimal = round ? tcOptimalPlay(round.player) : null;
  const wageredNow = round ? round.ante + round.pairPlus + (res?.played ? round.ante : 0) : 0;

  return (
    <GameShell
      game="trescartas"
      title="Póker de 3 cartas"
      dock={
        <>
          {deciding && round ? (
            <CoachBox
              headline={<>Te recomiendo: <b>{ev ? (ev.play > ev.fold ? 'Jugar' : 'Retirarte') : optimal ? 'Jugar' : 'Retirarte'}</b></>}
              nums={ev ? [{ label: 'EV jugar', value: `${fmtSignedChips(ev.play * round.ante)}`, tone: ev.play > ev.fold ? 'good' : undefined }, { label: 'EV retirarte', value: fmtSignedChips(ev.fold * round.ante), tone: ev.fold >= ev.play ? 'good' : undefined }] : []}
              lines={[
                'EV calculado revisando las 18,424 manos posibles del crupier con las cartas que quedan (sin ver sus cartas).',
                'Regla óptima: juega con dama-6-4 o mejor; retírate con menos. Con pareja o mejor siempre juega.',
                'El Pair Plus se paga según tu mano, sin importar el crupier, aunque te retires.',
              ]}
              defaultOpen={false}
            />
          ) : null}
          {res && round ? <ResultBanner wagered={wageredNow} returned={wageredNow + res.net} text={`${OUT_ES[res.outcome]}${res.bonusNet ? ` · bono de Ante +${fmtChips(res.bonusNet)}` : ''}${round.pairPlus ? ` · Pair Plus ${fmtSignedChips(res.pairPlusNet)}` : ''}`} /> : null}
          {deciding && round ? (
            <div className="action-buttons">
              <button className="act-btn act-fold" onClick={() => finish(round, false, ev)}>Retirarse <kbd>F</kbd></button>
              <button className="act-btn act-raise" onClick={() => finish(round, true, ev)} disabled={w.chips < round.ante}>Jugar {fmtChips(round.ante)} <kbd>J</kbd></button>
            </div>
          ) : (
            <>
              <div className="tc-bets">
                <BetPicker label="Ante" value={ante} onChange={setAnte} max={Math.min(1000, Math.floor((w.chips - pp) / 2))} />
                <BetPicker label="Pair Plus (opcional)" value={pp} onChange={setPp} max={Math.min(500, Math.max(0, w.chips - ante * 2))} />
              </div>
              <div className="btn-row">
                <button className="btn btn-gold btn-lg" onClick={deal} disabled={ante <= 0 || ante * 2 + pp > w.chips}>Repartir · {fmtChips(ante + pp)} <kbd>↵</kbd></button>
              </div>
              {ante > 0 && ante * 2 + pp > w.chips ? <p className="muted small center">Necesitas fichas para el Ante y para una posible apuesta Jugar.</p> : null}
            </>
          )}
        </>
      }
    >
      <section className="tc-table">
        <div className="tc-side">
          <span className="seat-name">Crupier {res ? `· ${TC_NAMES_ES[res.dealerHand]}${!res.qualifies ? ' (no califica)' : ''}` : '· califica con dama alta'}</span>
          <div className="bj-cards">{(round ? round.dealer : [null, null, null]).map((c, i) => <PlayingCard key={`d${i}-${res ? 'up' : 'down'}-${c}`} card={res && round ? c : null} size="md" delay={i * 90} className={res ? 'flip-in' : ''} animate={!reduced} />)}</div>
        </div>
        <div className="tc-pays">
          <div><b>Pair Plus</b> {(['straightFlush', 'trips', 'straight', 'flush', 'pair'] as const).map((h) => <span key={h} className={ph === h ? 'hit' : ''}>{TC_NAMES_ES[h]} {PAIR_PLUS[h]}:1</span>)}</div>
          <div><b>Bono de Ante</b> {(['straightFlush', 'trips', 'straight'] as const).map((h) => <span key={h} className={ph === h ? 'hit' : ''}>{TC_NAMES_ES[h]} {ANTE_BONUS[h]}:1</span>)}</div>
        </div>
        <div className="tc-side">
          <div className="bj-cards">{(round ? round.player : [null, null, null]).map((c, i) => <PlayingCard key={`p${i}-${c}`} card={c} size="lg" delay={i * 90} animate={!reduced} />)}</div>
          <span className="seat-name">Tú {ph ? `· ${TC_NAMES_ES[ph]}` : ''}</span>
        </div>
      </section>
    </GameShell>
  );
}
