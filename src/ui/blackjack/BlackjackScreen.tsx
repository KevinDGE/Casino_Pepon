import { useEffect, useState } from 'react';
import { TopBar } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Field, Segmented, Toggle } from '../components/Controls';
import { PlayingCard } from '../components/PlayingCard';
import { ChipToken } from '../components/Chip';
import { useProfile, useReducedMotion } from '../store';
import { useHotkeys } from '../hooks';
import { Tutorial } from '../screens/Tutorial';
import { useBlackjack, MIN_BET, MAX_BET, type Companion } from './useBlackjack';
import { getLegal } from '../../engine/blackjack/game';
import { describeHand, handTotal, cardValue } from '../../engine/blackjack/hand';
import type { BJHand, BlackjackRules } from '../../engine/blackjack/types';
import { BJ_ACTION_ES } from '../../coach/blackjackCoach';
import { estimateHouseEdge } from '../../engine/blackjack/houseEdge';
import { fmtChips, fmtPct, fmtSignedChips } from '../../coach/format';
import { LEVEL_NAMES_ES } from '../../ai/poker/bots';
import type { BJLevel } from '../../ai/blackjack/strategy';

const CHIP_VALUES = [5, 25, 100, 500, 1000];
const OUTCOME: Record<string, { t: string; c: string }> = {
  blackjack: { t: 'Blackjack', c: 'good' }, win: { t: 'Gana', c: 'good' }, push: { t: 'Empate', c: '' }, lose: { t: 'Pierde', c: 'bad' }, bust: { t: 'Se pasó', c: 'bad' },
};

function HandView({ hand, active, small, reduced }: { hand: BJHand; active: boolean; small?: boolean; reduced: boolean }) {
  const o = hand.outcome ? OUTCOME[hand.outcome] : null;
  return (
    <div className={`bj-hand ${active ? 'active' : ''} ${small ? 'small' : ''}`}>
      <div className="bj-cards">
        {hand.cards.map((c, i) => <PlayingCard key={i} card={c} size={small ? 'sm' : 'md'} delay={i * 80} animate={!reduced} />)}
      </div>
      <div className="bj-hand-meta">
        <span className="bj-total">{describeHand(hand.cards)}</span>
        <span className="bj-bet"><span className="chip chip-mini chip-green" aria-hidden="true" /> {fmtChips(hand.bet)}{hand.doubled ? ' ×2' : ''}</span>
        {o ? <span className={`bj-outcome ${o.c}`}>{o.t}{hand.net ? ` ${fmtSignedChips(hand.net)}` : ''}</span> : null}
      </div>
    </div>
  );
}

function RulesModal({ open, onClose, rules, companions, level, onApply }: {
  open: boolean; onClose: () => void; rules: BlackjackRules; companions: number; level: BJLevel;
  onApply: (r: BlackjackRules, c: number, l: BJLevel) => void;
}) {
  const [r, setR] = useState(rules);
  const [c, setC] = useState(companions);
  const [l, setL] = useState(level);
  useEffect(() => { if (open) { setR(rules); setC(companions); setL(level); } }, [open, rules, companions, level]);
  return (
    <Modal open={open} title="Reglas de la mesa" onClose={onClose} size="lg"
      footer={<><span className="muted small">Ventaja de la casa ≈ {fmtPct(estimateHouseEdge(r), 2)}</span><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-gold" onClick={() => { onApply(r, c, l); onClose(); }}>Aplicar y barajar</button></>}>
      <div className="rules-grid">
        <Field label="Mazos"><Segmented label="Mazos" value={r.decks} onChange={(v) => setR({ ...r, decks: v })} options={([1, 2, 4, 6, 8] as const).map((d) => ({ value: d, label: String(d) }))} /></Field>
        <Field label="Pago del blackjack"><Segmented label="Pago" value={r.blackjackPays} onChange={(v) => setR({ ...r, blackjackPays: v })} options={[{ value: '3:2', label: '3:2' }, { value: '6:5', label: '6:5' }]} /></Field>
        <Toggle label="El crupier pide con 17 suave (H17)" checked={r.dealerHitsSoft17} onChange={(v) => setR({ ...r, dealerHitsSoft17: v })} />
        <Toggle label="El crupier revisa blackjack (regla americana)" hint="Sin revisión pierdes también lo doblado/dividido si tiene blackjack" checked={r.dealerPeeks} onChange={(v) => setR({ ...r, dealerPeeks: v })} />
        <Field label="Doblar con"><Segmented label="Doblar" value={r.doubleOn} onChange={(v) => setR({ ...r, doubleOn: v })} options={[{ value: 'any', label: 'Cualquier mano' }, { value: '9-11', label: '9 a 11' }, { value: '10-11', label: '10 y 11' }]} /></Field>
        <Toggle label="Doblar después de dividir" checked={r.doubleAfterSplit} onChange={(v) => setR({ ...r, doubleAfterSplit: v })} />
        <Field label="Máximo de manos al dividir"><Segmented label="Máximo de manos" value={r.maxHands} onChange={(v) => setR({ ...r, maxHands: v })} options={([2, 3, 4] as const).map((d) => ({ value: d, label: String(d) }))} /></Field>
        <Toggle label="Re-dividir ases" checked={r.resplitAces} onChange={(v) => setR({ ...r, resplitAces: v })} />
        <Toggle label="Pedir con ases divididos" checked={r.hitSplitAces} onChange={(v) => setR({ ...r, hitSplitAces: v })} />
        <Field label={`Penetración del zapato: ${Math.round(r.penetration * 100)}%`}><input type="range" min={0.5} max={0.9} step={0.05} value={r.penetration} onChange={(e) => setR({ ...r, penetration: Number(e.target.value) })} aria-label="Penetración" /></Field>
        <Field label="Compañeros de mesa (IA)"><Segmented label="Compañeros" value={c} onChange={setC} options={[0, 1, 2].map((n) => ({ value: n, label: String(n) }))} /></Field>
        {c > 0 ? <Field label="Nivel de los compañeros"><Segmented label="Nivel" value={l} onChange={setL} options={(['beginner', 'intermediate', 'advanced', 'expert'] as BJLevel[]).map((x) => ({ value: x, label: LEVEL_NAMES_ES[x] }))} /></Field> : null}
      </div>
    </Modal>
  );
}

export function BlackjackScreen() {
  const { profile, update } = useProfile();
  const bj = useBlackjack();
  const reduced = useReducedMotion();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const s = bj.state;
  useEffect(() => { if (!profile.tutorialsSeen.blackjack) setTutorial(true); }, [profile.tutorialsSeen.blackjack]);
  const closeTutorial = () => { setTutorial(false); update((d) => { d.tutorialsSeen.blackjack = true; }); };

  const human = s.seats[bj.humanIdx]!;
  const myTurn = s.phase === 'playing' && s.turn?.seat === bj.humanIdx;
  const legal = myTurn ? getLegal(s) : null;
  const betting = s.phase === 'betting' || s.phase === 'settled';
  const insurancePending = s.phase === 'insurance' && !human.insuranceDecided;
  const bankroll = betting ? profile.chips : human.bankroll;
  const canDeal = betting && bj.bet >= MIN_BET && bj.bet <= profile.chips;
  const dealerShown = s.holeRevealed ? s.dealer : s.dealer.slice(0, 1);
  const dTotal = handTotal(dealerShown);
  const roundNet = s.phase === 'settled' ? human.hands.reduce((a, h) => a + h.net, 0) + human.insuranceNet : 0;

  const addChip = (v: number) => bj.setBet(Math.min(MAX_BET, profile.chips, bj.bet + v));
  // Si el saldo baja de la apuesta elegida, ajustarla.
  useEffect(() => {
    if (betting && bj.bet > profile.chips) bj.setBet(Math.max(0, Math.min(profile.chips, MAX_BET)));
  }, [betting, bj, profile.chips]);

  useHotkeys({
    h: () => legal?.hit && bj.act('hit'),
    s: () => legal?.stand && bj.act('stand'),
    d: () => legal?.double && bj.act('double'),
    p: () => legal?.split && bj.act('split'),
    y: () => insurancePending && bj.insurance(true),
    n: () => insurancePending && bj.insurance(false),
    Enter: () => canDeal && bj.deal(),
    k: () => setCoachOpen((v) => !v),
    '?': () => setTutorial(true),
  });

  const r = s.rules;
  const rulesSummary = `${r.decks} ${r.decks === 1 ? 'mazo' : 'mazos'} · ${r.dealerHitsSoft17 ? 'H17' : 'S17'} · BJ ${r.blackjackPays}${r.doubleAfterSplit ? ' · DAS' : ''}`;

  return (
    <div className="game-page bj-page">
      <TopBar title="Blackjack" back right={<button className="icon-btn" onClick={() => setTutorial(true)} aria-label="Tutorial y atajos"><Icon name="help" /></button>} />
      <div className="bj-table">
        <div className="bj-felt" aria-hidden="true"><span className="bj-arc">BLACKJACK PAGA {r.blackjackPays} · SEGURO PAGA 2:1</span></div>
        <section className="bj-dealer" aria-label="Crupier">
          <div className="bj-dealer-head">
            <span className="seat-name">Crupier</span>
            {s.dealer.length ? <span className="bj-total">{s.holeRevealed ? describeHand(s.dealer) : `${cardValue(s.dealer[0]!) === 1 ? 'A' : cardValue(s.dealer[0]!)}`}</span> : null}
          </div>
          <div className="bj-cards">
            {s.dealer.map((c, i) => (i === 1 && !s.holeRevealed ? <PlayingCard key={`h${s.round}`} card={null} size="md" delay={240} animate={!reduced} /> : <PlayingCard key={`${s.round}-${i}`} card={c} size="md" delay={i * 80} animate={!reduced} className={i === 1 ? 'flip-in' : ''} />))}
            {!s.dealer.length ? <span className="muted">Haz tu apuesta</span> : null}
          </div>
          {s.holeRevealed && dTotal.total > 21 ? <span className="bj-outcome good">El crupier se pasó</span> : null}
        </section>
        <div className="bj-shoe" title="Cartas restantes en el zapato">
          <button className="btn btn-ghost btn-sm" onClick={() => setRulesOpen(true)} disabled={!betting}>Reglas: {rulesSummary}</button>
          <span className="shoe-meter" role="meter" aria-valuemin={0} aria-valuemax={s.shoe.length} aria-valuenow={bj.remaining} aria-label="Cartas restantes">
            <span style={{ width: `${(bj.remaining / Math.max(1, s.shoe.length)) * 100}%` }} />
          </span>
          <small>{bj.remaining} cartas</small>
        </div>
        <section className="bj-seats">
          {s.seats.map((seat, i) => {
            const comp = bj.layout[i] as Companion | 'human';
            const isH = comp === 'human';
            return (
              <div key={i} className={`bj-seat ${isH ? 'human' : 'companion'} ${s.turn?.seat === i ? 'turn' : ''}`}>
                <div className="bj-seat-head">
                  {isH ? <span className="avatar">TÚ</span> : <span className="avatar" style={{ background: `linear-gradient(135deg, ${comp.colors[0]}, ${comp.colors[1]})` }}>{comp.initials}</span>}
                  <span className="seat-info"><span className="seat-name">{isH ? 'Tú' : comp.name}</span><span className="seat-stack">{isH ? fmtChips(bankroll) : LEVEL_NAMES_ES[comp.level]}</span></span>
                </div>
                <div className="bj-hands">
                  {seat.hands.map((h, hi) => <HandView key={hi} hand={h} active={s.turn?.seat === i && s.turn.hand === hi} small={!isH} reduced={reduced} />)}
                  {!seat.hands.length && isH && betting ? <div className="bj-bet-circle" aria-label={`Apuesta: ${fmtChips(bj.bet)}`}><ChipToken value={Math.max(5, bj.bet)} size={44} /><b>{fmtChips(bj.bet)}</b></div> : null}
                </div>
                {seat.insurance ? <span className="bj-ins">Seguro {fmtChips(seat.insurance)}{seat.insuranceNet ? ` → ${fmtSignedChips(seat.insuranceNet)}` : ''}</span> : null}
              </div>
            );
          })}
        </section>
      </div>
      <div className="dock">
        {profile.settings.coach && myTurn && bj.advice ? (
          <div className={`coach-card ${coachOpen ? 'open' : ''}`}>
            <div className="coach-head">
              <span className="coach-badge"><Icon name="bulb" size={18} /> Coach</span>
              <span className="coach-rec">Te recomiendo: <b>{BJ_ACTION_ES[bj.advice.best]}</b></span>
              <button className="btn btn-ghost btn-sm" onClick={() => setCoachOpen(!coachOpen)} aria-expanded={coachOpen}>{coachOpen ? 'Ocultar' : '¿Por qué?'} <kbd>K</kbd></button>
            </div>
            <div className="coach-nums">
              {bj.advice.evs.map((e) => <span key={e.action} className={e.action === bj.advice!.best ? 'best' : ''}><small>{BJ_ACTION_ES[e.action]}</small><b>{e.ev >= 0 ? '+' : ''}{(e.ev * 100).toFixed(1)}%</b></span>)}
            </div>
            {coachOpen ? <div className="coach-body"><ul className="coach-reasons">{bj.advice.reasons.map((x) => <li key={x}>{x}</li>)}</ul><p className="muted small">EV = ganancia o pérdida promedio por cada ficha apostada en esta mano. Se calcula con las reglas activas y las cartas visibles, nunca con la carta oculta.</p></div> : null}
          </div>
        ) : null}
        {insurancePending ? (
          <div className="prompt-bar slide-up">
            <div>
              <b>El crupier muestra un As. ¿Tomas seguro por {fmtChips(Math.min(Math.floor(human.baseBet / 2), human.bankroll))}?</b>
              {profile.settings.coach && bj.insAdvice ? <p className="small">Coach: {bj.insAdvice.take ? 'tómalo' : 'no lo tomes'}. {bj.insAdvice.reasons[1]} {bj.insAdvice.reasons[2]}</p> : null}
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost btn-lg" onClick={() => bj.insurance(false)}>No <kbd>N</kbd></button>
              <button className="btn btn-gold btn-lg" disabled={human.bankroll < 1} onClick={() => bj.insurance(true)}>Sí <kbd>Y</kbd></button>
            </div>
          </div>
        ) : null}
        {myTurn && legal ? (
          <div className="action-buttons" role="group" aria-label="Tus acciones">
            <button className="act-btn act-call" disabled={!legal.hit} onClick={() => bj.act('hit')}>Pedir <kbd>H</kbd></button>
            <button className="act-btn act-check" onClick={() => bj.act('stand')}>Plantarse <kbd>S</kbd></button>
            <button className="act-btn act-raise" disabled={!legal.double} onClick={() => bj.act('double')}>Doblar <kbd>D</kbd></button>
            <button className="act-btn act-fold" disabled={!legal.split} onClick={() => bj.act('split')}>Dividir <kbd>P</kbd></button>
          </div>
        ) : null}
        {s.phase === 'playing' && !myTurn ? <div className="wait-bar" role="status">Juega {s.turn ? s.seats[s.turn.seat]!.name : 'el crupier'}…</div> : null}
        {s.phase === 'insurance' && !insurancePending ? <div className="wait-bar" role="status">Esperando decisiones de seguro…</div> : null}
        {betting ? (
          <div className="bet-panel">
            {s.phase === 'settled' ? (
              <div className="result-text center">
                <b className={roundNet > 0 ? 'good' : roundNet < 0 ? 'bad' : ''}>{roundNet > 0 ? `Ganaste ${fmtChips(roundNet)}` : roundNet < 0 ? `Perdiste ${fmtChips(-roundNet)}` : 'Empate'}</b>
                {bj.lastReview.length ? <small>{bj.lastReview.map((d) => d.comment).join(' ')}</small> : null}
              </div>
            ) : null}
            <div className="chip-row" role="group" aria-label="Agregar fichas a la apuesta">
              {CHIP_VALUES.map((v) => (
                <button key={v} className="chip-pick" onClick={() => addChip(v)} disabled={bj.bet + v > Math.min(MAX_BET, profile.chips)} aria-label={`Agregar ${v}`}>
                  <ChipToken value={v} size={46} />
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => bj.setBet(0)}>Limpiar</button>
              <button className="btn btn-ghost" onClick={() => bj.setBet(Math.min(MAX_BET, profile.chips, bj.bet * 2))} disabled={bj.bet === 0}>×2</button>
              <button className="btn btn-gold btn-lg" disabled={!canDeal} onClick={bj.deal}>Repartir {fmtChips(bj.bet)} <kbd>↵</kbd></button>
            </div>
            <p className="muted small center">Apuesta mínima {MIN_BET}, máxima {fmtChips(MAX_BET)}.{profile.chips < MIN_BET ? ' No tienes fichas: reinícialas gratis en Ajustes.' : ''}</p>
          </div>
        ) : null}
      </div>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} rules={s.rules} companions={profile.blackjackSetup.companions} level={profile.blackjackSetup.companionLevel} onApply={bj.applySetup} />
      <Tutorial game="blackjack" open={tutorial} onClose={closeTutorial} />
    </div>
  );
}
