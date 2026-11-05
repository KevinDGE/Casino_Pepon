import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Field, Segmented, Toggle } from '../components/Controls';
import { useProfile } from '../store';
import { navigate } from '../router';
import { useHotkeys, useLandscape } from '../hooks';
import { Tutorial } from '../screens/Tutorial';
import { usePokerTable } from './usePokerTable';
import { PokerTableView } from './PokerTableView';
import { ActionBar } from './ActionBar';
import { CoachCard } from './CoachCard';
import { ReviewModal } from './ReviewModal';
import { fmtChips } from '../../coach/format';
import type { PokerSetup } from '../../persistence/schema';
import { LEVEL_NAMES_ES } from '../../ai/poker/bots';
import { getLegalActions } from '../../engine/poker/game';

function Setup({ onStart }: { onStart: (s: PokerSetup) => boolean }) {
  const { profile } = useProfile();
  const [s, setS] = useState<PokerSetup>(profile.pokerSetup);
  const buyIn = s.buyInBB * s.bigBlind;
  const enough = profile.chips >= buyIn;
  return (
    <main id="main" className="page-main setup">
      <h1 className="page-title">Nueva mesa de Texas Hold’em</h1>
      <section className="panel">
        <Field label={`Rivales: ${s.rivals}`}>
          <Segmented label="Número de rivales" value={s.rivals} onChange={(v) => setS({ ...s, rivals: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
        <Field label="Nivel de los rivales" hint={s.level === 'mixed' ? 'Cada rival tendrá un nivel distinto; se muestra en la mesa.' : undefined}>
          <Segmented
            label="Nivel"
            value={s.level}
            onChange={(v) => setS({ ...s, level: v })}
            options={[
              { value: 'beginner', label: LEVEL_NAMES_ES.beginner },
              { value: 'intermediate', label: LEVEL_NAMES_ES.intermediate },
              { value: 'advanced', label: LEVEL_NAMES_ES.advanced },
              { value: 'expert', label: LEVEL_NAMES_ES.expert },
              { value: 'mixed', label: 'Mixto' },
            ]}
          />
        </Field>
        <Field label="Ciegas">
          <Segmented label="Ciegas" value={s.bigBlind} onChange={(v) => setS({ ...s, bigBlind: v })} options={[10, 20, 50, 100].map((bb) => ({ value: bb, label: `${bb / 2}/${bb}` }))} />
        </Field>
        <Field label={`Fichas para la mesa: ${fmtChips(buyIn)} (${s.buyInBB} ciegas grandes)`}>
          <Segmented label="Compra de entrada" value={s.buyInBB} onChange={(v) => setS({ ...s, buyInBB: v })} options={[40, 100, 200].map((x) => ({ value: x, label: `${x} BB` }))} />
        </Field>
        <Toggle
          label="Ciegas que suben (estilo torneo)"
          hint="Se duplican cada 15 manos para que la partida termine"
          checked={s.blindIncreaseEvery > 0}
          onChange={(v) => setS({ ...s, blindIncreaseEvery: v ? 15 : 0 })}
        />
      </section>
      {!enough ? (
        <div className="notice">Necesitas {fmtChips(buyIn)} fichas y tienes {fmtChips(profile.chips)}. Elige una mesa más pequeña o reinicia tus fichas gratis en Ajustes.</div>
      ) : null}
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={() => navigate('lobby')}>Volver</button>
        <button className="btn btn-gold btn-lg" disabled={!enough} onClick={() => onStart(s)}>Sentarse a jugar</button>
      </div>
    </main>
  );
}

export function PokerScreen() {
  const { profile, update } = useProfile();
  const t = usePokerTable();
  const landscape = useLandscape();
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [boardDone, setBoardDone] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [coachOpenKey, setCoachOpenKey] = useState(0);
  const onBoardRevealed = useCallback((d: boolean) => setBoardDone(d), []);

  useEffect(() => {
    if (!profile.tutorialsSeen.poker) setTutorial(true);
  }, [profile.tutorialsSeen.poker]);
  const closeTutorial = () => { setTutorial(false); update((d) => { d.tutorialsSeen.poker = true; }); };

  const st = t.state;
  const myTurn = !!st && st.phase === 'betting' && st.toAct === 0;
  const legal = st && myTurn ? getLegalActions(st, 0) : null;
  useEffect(() => { if (!myTurn) setRaiseOpen(false); }, [myTurn]);

  const handOver = !!st && (st.phase === 'handOver' || st.phase === 'gameOver') && boardDone;
  const net = st?.result?.net[0] ?? 0;

  useHotkeys({
    f: () => legal?.canFold && t.act({ type: 'fold' }),
    c: () => legal && (legal.canCheck ? t.act({ type: 'check' }) : legal.canCall && t.act({ type: 'call' })),
    r: () => legal?.canRaise && setRaiseOpen(true),
    a: () => legal?.canRaise ? t.act({ type: 'raise', to: legal.maxRaiseTo }) : legal?.canCall && t.act({ type: 'call' }),
    n: () => (st?.phase === 'handOver' || st?.phase === 'idle') && !t.humanOut && t.dealNext(),
    k: () => setCoachOpenKey((k) => k + 1),
    '?': () => setTutorial(true),
  }, !!st);

  if (!t.session || !st) {
    return (
      <div className="page">
        <TopBar title="Póker" back />
        <Setup onStart={t.createTable} />
        <Tutorial game="poker" open={tutorial} onClose={closeTutorial} />
      </div>
    );
  }

  const human = st.players[0]!;
  const winnersText = st.result
    ? [...new Set(st.result.pots.flatMap((p) => p.winners))].map((w) => (w === 0 ? 'Tú' : st.players[w]!.name)).join(' y ')
    : '';
  const winDesc = st.result?.showdown ? st.log.find((e) => e.t === 'win')?.desc ?? null : null;

  return (
    <div className="game-page poker-page">
      <TopBar
        title={`Póker · ${fmtChips(st.smallBlind)}/${fmtChips(st.bigBlind)}`}
        back
        right={
          <>
            <button className="icon-btn" onClick={() => setTutorial(true)} aria-label="Tutorial y atajos"><Icon name="help" /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(true)}>Salir</button>
          </>
        }
      />
      <div className="table-wrap-area">
        <PokerTableView state={st} seats={t.session.seats} thinking={t.thinking} landscape={landscape} onBoardRevealed={onBoardRevealed} />
      </div>
      <div className="dock">
        {myTurn && profile.settings.coach ? <CoachCard key={`${st.handNumber}-${st.log.length}-${coachOpenKey}`} advice={t.advice} loading={t.adviceLoading} onApply={t.act} /> : null}
        {myTurn && legal ? (
          <ActionBar
            legal={legal}
            pot={st.players.reduce((a, p) => a + p.contributed, 0)}
            currentBet={st.currentBet}
            myBet={human.bet}
            bigBlind={st.bigBlind}
            disabled={false}
            onAct={t.act}
            raiseOpen={raiseOpen}
            setRaiseOpen={setRaiseOpen}
          />
        ) : null}
        {st.phase === 'betting' && !myTurn ? (
          <div className="wait-bar" role="status">
            {human.folded ? 'Te retiraste. Mira cómo termina la mano…' : human.allIn ? 'Estás all-in. Veamos las cartas…' : `Turno de ${st.players[st.toAct ?? 0]?.name ?? ''}…`}
          </div>
        ) : null}
        {st.phase === 'idle' ? (
          <div className="result-bar">
            <span>Mesa lista. Tienes {fmtChips(human.stack)} fichas.</span>
            <button className="btn btn-gold btn-lg" onClick={t.dealNext} autoFocus>Repartir <kbd>N</kbd></button>
          </div>
        ) : null}
        {handOver && !t.humanOut && !t.tableWon ? (
          <div className="result-bar slide-up">
            <div className="result-text">
              <b className={net > 0 ? 'good' : net < 0 ? 'bad' : ''}>
                {net > 0 ? `Ganaste ${fmtChips(net)}` : net < 0 ? `Perdiste ${fmtChips(-net)}` : 'Sin cambios'}
              </b>
              <small>{winnersText} {winnersText.includes(' y ') ? 'ganan' : winnersText === 'Tú' ? 'ganas' : 'gana'}{winDesc ? ` con ${winDesc.toLowerCase()}` : ''}</small>
            </div>
            <div className="btn-row">
              {t.review && t.review.length ? <button className="btn btn-ghost" onClick={() => setShowReview(true)}>Revisión</button> : null}
              <button className="btn btn-gold btn-lg" onClick={t.dealNext} autoFocus>Siguiente mano <kbd>N</kbd></button>
            </div>
          </div>
        ) : null}
      </div>
      <ReviewModal open={showReview && !!t.review} records={t.review ?? []} onClose={() => setShowReview(false)} />
      <Modal open={handOver && t.humanOut} title="Te quedaste sin fichas en la mesa" dismissible={false}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { t.leaveTable(); navigate('lobby'); }}>Salir al inicio</button>
            <button className="btn btn-gold" disabled={profile.chips < t.session.buyIn} onClick={() => t.rebuy()}>Volver a entrar ({fmtChips(t.session.buyIn)})</button>
          </>
        }>
        <p>No pasa nada: son fichas virtuales. {t.review?.length ? 'Revisa la última mano con el coach para aprender de ella.' : ''}</p>
        {t.review?.length ? <button className="btn btn-ghost btn-sm" onClick={() => setShowReview(true)}>Ver revisión</button> : null}
        {profile.chips < t.session.buyIn ? <p className="muted">No tienes fichas suficientes para volver a entrar. Puedes reiniciarlas gratis en Ajustes.</p> : null}
      </Modal>
      <Modal open={handOver && t.tableWon} title="¡Ganaste la mesa!" dismissible={false}
        footer={<button className="btn btn-gold" onClick={() => { t.cashOut(); navigate('lobby'); }}>Cobrar {fmtChips(human.stack)} y salir</button>}>
        <p>Eliminaste a todos tus rivales. Tus {fmtChips(human.stack)} fichas vuelven a tu saldo.</p>
      </Modal>
      <ConfirmDialog
        open={confirmLeave}
        title="Salir de la mesa"
        message={<p>{st.phase === 'betting' ? 'Salir ahora cuenta como retirarte de la mano en curso: pierdes lo que ya apostaste en ella. ' : ''}Tus fichas de la mesa vuelven a tu saldo.</p>}
        confirmText="Salir"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => { setConfirmLeave(false); t.leaveTable(); navigate('lobby'); }}
      />
      <Tutorial game="poker" open={tutorial} onClose={closeTutorial} />
    </div>
  );
}
