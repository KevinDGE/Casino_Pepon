import { useEffect, useRef, useState } from 'react';
import { GameShell, CoachBox, ResultBanner } from './Shell';
import { useWallet } from './useWallet';
import { PlayingCard } from '../components/PlayingCard';
import { Segmented } from '../components/Controls';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng } from '../../core/rng';
import { cardAriaLabel } from '../../core/cards';
import {
  VP_NAMES_ES, VP_ORDER, maskToHold, holdToMask, vpDeal, vpDraw, vpPayPerCoin, vpSimpleStrategy, type VPState,
} from '../../engine/videopoker/videopoker';
import { requestVideoPokerEVs } from '../../workers/aiClient';
import { fmtChips } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();
const COIN_VALUES = [1, 5, 25, 100];

export function VideoPokerScreen() {
  const w = useWallet('videopoker');
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const [coins, setCoins] = useState(5);
  const [coinValue, setCoinValue] = useState(5);
  const [st, setSt] = useState<VPState | null>(null);
  const [hold, setHold] = useState<boolean[]>([false, false, false, false, false]);
  const [evs, setEvs] = useState<number[] | null>(null);
  const [review, setReview] = useState<{ chosen: number; best: number; bestMask: number } | null>(null);
  const [dealId, setDealId] = useState(0);
  const evsFor = useRef(0);
  const bet = coins * coinValue;
  const live = useRef({ st, coins, coinValue });
  live.current = { st, coins, coinValue };
  // Si se sale con una mano a medias, se completa con la estrategia básica (no se anula).
  useEffect(() => () => {
    const { st: s, coins: c, coinValue: v } = live.current;
    if (s && s.phase === 'draw') {
      const done = vpDraw(s, maskToHold(vpSimpleStrategy(s.hand)));
      const pay = vpPayPerCoin(done.result!, c) * c * v;
      w.settle(c * v, pay, `${VP_NAMES_ES[done.result!]} (mano completada automáticamente)`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const phase = st?.phase ?? 'deal';
  const drawing = phase === 'draw';

  const deal = () => {
    if (drawing || !w.debit(bet)) return;
    const s = vpDeal(rng, bet);
    setSt(s);
    setHold([false, false, false, false, false]);
    setEvs(null);
    setReview(null);
    const id = dealId + 1;
    setDealId(id);
    evsFor.current = id;
    play('card');
    announce(`Tus cartas: ${s.hand.map(cardAriaLabel).join(', ')}.`);
    void requestVideoPokerEVs(s.hand, coins >= 5 ? 800 : 250).then((e) => { if (evsFor.current === id) setEvs(e); }).catch(() => undefined);
  };

  const draw = () => {
    if (!st || !drawing) return;
    const done = vpDraw(st, hold);
    const pay = done.result ? vpPayPerCoin(done.result, coins) * coins * coinValue : 0;
    const res = { ...done, payout: pay };
    setSt(res);
    let coach: { good: boolean; evLoss: number } | undefined;
    if (evs) {
      let bestMask = 0;
      for (let m = 1; m < 32; m++) if (evs[m]! > evs[bestMask]!) bestMask = m;
      const chosen = evs[holdToMask(hold)]!;
      setReview({ chosen, best: evs[bestMask]!, bestMask });
      coach = { good: evs[bestMask]! - chosen < 1e-9, evLoss: evs[bestMask]! - chosen };
    }
    w.settle(bet, pay, `${VP_NAMES_ES[done.result!]} · apuesta ${fmtChips(bet)}`, coach);
    play(pay > bet ? 'win' : pay > 0 ? 'chip' : 'lose');
    announce(`${VP_NAMES_ES[done.result!]}. ${pay > 0 ? `Cobras ${fmtChips(pay)}.` : 'Sin premio.'}`);
  };

  const toggle = (i: number) => {
    if (!drawing) return;
    setHold((h) => h.map((x, k) => (k === i ? !x : x)));
    play('click');
  };

  useHotkeys({
    1: () => toggle(0), 2: () => toggle(1), 3: () => toggle(2), 4: () => toggle(3), 5: () => toggle(4),
    Enter: () => (drawing ? draw() : deal()), ' ': () => (drawing ? draw() : deal()),
  });
  useEffect(() => { if (!drawing && bet > w.chips && w.chips > 0) setCoinValue(COIN_VALUES.filter((v) => v * coins <= w.chips).pop() ?? 1); }, [drawing, bet, w.chips, coins]);

  const bestMask = evs ? evs.reduce((bm, v, m) => (v > evs[bm]! ? m : bm), 0) : null;
  const winRow = phase === 'done' ? st?.result : null;
  const canAfford = bet <= w.chips;

  return (
    <GameShell
      game="videopoker"
      title="Video póker"
      className="vp-page"
      dock={
        <>
          {drawing ? (
            <CoachBox
              headline={evs && bestMask !== null ? <>Conserva: <b>{bestMask === 0 ? 'nada (cambia las 5)' : maskToHold(bestMask).map((h, i) => (h ? `carta ${i + 1}` : null)).filter(Boolean).join(', ')}</b></> : 'Calculando las 32 opciones…'}
              nums={evs && bestMask !== null ? [
                { label: 'EV óptimo', value: `${(evs[bestMask]! * bet).toFixed(1)} fichas`, tone: 'good' },
                { label: 'EV de tu selección', value: `${(evs[holdToMask(hold)]! * bet).toFixed(1)} fichas` },
              ] : []}
              lines={[
                'El coach revisa las 32 formas de conservar cartas y, para cada una, todas las combinaciones de cartas que podrían llegar (hasta 1,533,939).',
                'EV = premio promedio que recibirías conservando esas cartas. Compáralo con tu apuesta para ver cuánto recuperas en promedio.',
                'Regla rápida: una pareja de jotas o mejor casi siempre se conserva; 4 cartas a escalera real se conservan aunque rompas una pareja.',
              ]}
            />
          ) : null}
          {phase === 'done' && st ? <ResultBanner wagered={bet} returned={st.payout} text={review ? (review.best - review.chosen < 1e-9 ? 'El coach confirma: conservaste las cartas óptimas.' : `Tu selección tenía EV ${(review.chosen * bet).toFixed(1)}; la óptima, ${(review.best * bet).toFixed(1)} fichas.`) : undefined} /> : null}
          {!drawing ? (
            <div className="vp-controls">
              <Segmented label="Monedas" value={coins} onChange={setCoins} options={[1, 2, 3, 4, 5].map((c) => ({ value: c, label: `${c} ${c === 1 ? 'moneda' : 'mon.'}` }))} />
              <Segmented label="Valor de moneda" value={coinValue} onChange={setCoinValue} options={COIN_VALUES.map((v) => ({ value: v, label: `×${v}` }))} />
            </div>
          ) : null}
          <div className="btn-row">
            {drawing ? (
              <button className="btn btn-gold btn-lg wide" onClick={draw}>Cambiar cartas <kbd>↵</kbd></button>
            ) : (
              <button className="btn btn-gold btn-lg wide" onClick={deal} disabled={!canAfford}>Repartir · {fmtChips(bet)} <kbd>↵</kbd></button>
            )}
          </div>
          {!canAfford ? <p className="muted small center">No te alcanzan las fichas: baja la apuesta o reinícialas gratis en Ajustes.</p> : null}
        </>
      }
    >
      <section className="vp-machine">
        <table className="vp-paytable" aria-label="Tabla de pagos por moneda">
          <tbody>
            {VP_ORDER.map((h) => (
              <tr key={h} className={winRow === h ? 'hit' : ''}>
                <th scope="row">{VP_NAMES_ES[h]}</th>
                {[1, 2, 3, 4, 5].map((c) => <td key={c} className={c === coins ? 'cur' : ''}>{vpPayPerCoin(h, c) * c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="vp-cards" role="group" aria-label="Tu mano">
          {(st?.hand ?? [null, null, null, null, null]).map((c, i) => (
            <button
              key={`${dealId}-${i}-${c}`}
              className={`vp-card ${hold[i] ? 'held' : ''} ${bestMask !== null && drawing && (bestMask & (1 << i)) ? 'suggested' : ''}`}
              onClick={() => toggle(i)}
              disabled={!drawing}
              aria-pressed={hold[i]}
              aria-label={c === null ? `Carta ${i + 1}` : `Carta ${i + 1}: ${cardAriaLabel(c)}${hold[i] ? ', conservada' : ''}`}
            >
              <span className="vp-hold-tag">{hold[i] ? 'CONSERVAR' : ' '}</span>
              <PlayingCard card={c} size="lg" delay={i * 70} animate={!reduced} />
              <kbd className="vp-key">{i + 1}</kbd>
            </button>
          ))}
        </div>
        <p className="muted small center">Jugando perfecto con 5 monedas, esta tabla devuelve 99.54% de lo apostado a largo plazo.</p>
      </section>
    </GameShell>
  );
}
