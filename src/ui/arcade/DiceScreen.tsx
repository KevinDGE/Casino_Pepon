import { useMemo, useState } from 'react';
import { GameShell, CoachBox, ResultBanner, usePendingSettle } from './Shell';
import { useWallet } from './useWallet';
import { ChipToken } from '../components/Chip';
import { DieFace } from '../components/Art';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng } from '../../core/rng';
import { describeDiceBet, diceKey, diceNet, diceStats, payLabel, rollDice, TOTAL_PAYS, type DiceBet, type Roll } from '../../engine/dice/dice';
import { fmtChips, fmtPct } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();
const CHIPS = [1, 5, 25, 100, 500];

interface Placed extends DiceBet { amount: number }

function DiceCell({ bet, label, sub, className = '', amountOf, onAdd, disabled }: {
  bet: DiceBet; label: string; sub?: string; className?: string; amountOf: (b: DiceBet) => number; onAdd: (b: DiceBet) => void; disabled: boolean;
}) {
  const st = diceStats(bet);
  const amt = amountOf(bet);
  return (
    <button className={`dice-cell ${className}`} onClick={() => onAdd(bet)} disabled={disabled}
      aria-label={`${describeDiceBet(bet)}, paga ${payLabel(bet)}, gana ${fmtPct(st.pWin, 1)} de las veces, ventaja de la casa ${fmtPct(-st.ev, 1)}${amt ? `, apuesta ${amt}` : ''}`}
      title={`Probabilidad ${fmtPct(st.pWin, 2)} · casa ${fmtPct(-st.ev, 2)}`}>
      <b>{label}</b>
      {sub ? <small>{sub}</small> : null}
      {amt ? <span className="spot-chip"><ChipToken value={amt} size={24} /></span> : null}
    </button>
  );
}

export function DiceScreen() {
  const w = useWallet('dados');
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const pending = usePendingSettle();
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<Placed[]>([]);
  const [roll, setRoll] = useState<Roll>([1, 3, 6]);
  const [rolling, setRolling] = useState(false);
  const [last, setLast] = useState<{ wagered: number; returned: number; winners: string[] } | null>(null);
  const [history, setHistory] = useState<Roll[]>([]);
  const total = bets.reduce((a, b) => a + b.amount, 0);

  const add = (b: DiceBet) => {
    if (rolling) return;
    if (last) setLast(null);
    if (total + chip > w.chips) return;
    const k = diceKey(b);
    const ex = bets.find((x) => diceKey(x) === k);
    setBets(ex ? bets.map((x) => (diceKey(x) === k ? { ...x, amount: x.amount + chip } : x)) : [...bets, { ...b, amount: chip }]);
    play('chip');
  };
  const amountOn = (b: DiceBet) => bets.find((x) => diceKey(x) === diceKey(b))?.amount ?? 0;

  const doRoll = () => {
    if (rolling || !bets.length || !w.debit(total)) return;
    const r = rollDice(rng);
    setRolling(true);
    setLast(null);
    play('shuffle');
    const placed = bets;
    pending.set(() => {
      let ret = 0;
      const winners: string[] = [];
      for (const b of placed) {
        const n = diceNet(b, r);
        if (n > 0) { ret += b.amount * (n + 1); winners.push(describeDiceBet(b)); }
      }
      setRoll(r);
      setRolling(false);
      setHistory((h) => [r, ...h].slice(0, 14));
      w.settle(total, ret, `Dados ${r.join('-')} (suma ${r[0] + r[1] + r[2]})`);
      setLast({ wagered: total, returned: ret, winners });
      setBets([]);
      play(ret > total ? 'win' : 'lose');
      announce(`Salió ${r.join(', ')}. Suma ${r[0] + r[1] + r[2]}.`);
    });
    window.setTimeout(pending.run, reduced ? 120 : 1300);
  };

  useHotkeys({ ' ': doRoll, Enter: doRoll, x: () => !rolling && setBets([]) });

  const expected = useMemo(() => bets.reduce((a, b) => a + b.amount * diceStats(b).ev, 0), [bets]);
  return (
    <GameShell
      game="dados"
      title="Tres Dados"
      dock={
        <>
          <CoachBox
            headline={total ? <>Pérdida esperada de esta tirada: <b>{Math.abs(expected).toFixed(1)} fichas</b></> : <>Las apuestas con menor ventaja: <b>Chico, Grande, Par e Impar (2.78%)</b></>}
            nums={bets.slice(0, 4).map((b) => ({ label: describeDiceBet(b), value: `casa ${fmtPct(-diceStats(b).ev, 1)}` }))}
            lines={[
              'Con tres dados hay 216 resultados igual de probables; cada probabilidad que ves es exacta.',
              'Chico/Grande/Par/Impar pierden con cualquier triple: de ahí sale la ventaja de la casa de 2.78%.',
              'Las apuestas a sumas exactas y triples pagan mucho, pero su ventaja suele ser de 15% a 30%.',
            ]}
          />
          {last ? <ResultBanner wagered={last.wagered} returned={last.returned} text={last.winners.length ? `Ganaron: ${last.winners.join(', ')}` : undefined} /> : null}
          <div className="chip-row" role="radiogroup" aria-label="Valor de ficha">
            {CHIPS.map((v) => (
              <button key={v} role="radio" aria-checked={chip === v} className={`chip-pick ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)} aria-label={`Ficha de ${v}`}><ChipToken value={v} size={40} /></button>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setBets([])} disabled={rolling || !bets.length}>Limpiar</button>
            <button className="btn btn-gold btn-lg" onClick={doRoll} disabled={rolling || !bets.length || total > w.chips}>Lanzar {total ? fmtChips(total) : ''}</button>
          </div>
        </>
      }
    >
      <section className="dice-stage">
        <div className="dice-tray" aria-live="off">
          {roll.map((d, i) => <DieFace key={i} n={rolling ? ((i * 2 + history.length) % 6) + 1 : d} size={68} rolling={rolling && !reduced} />)}
          {!rolling ? <span className="dice-sum">Suma <b>{roll[0] + roll[1] + roll[2]}</b></span> : <span className="dice-sum">Rodando…</span>}
        </div>
        <div className="dice-history" aria-label="Tiradas anteriores">
          {history.map((r, i) => <span key={i} className="mini-roll">{r.join('·')}</span>)}
        </div>
      </section>
      <section className="dice-board" role="group" aria-label="Paño de apuestas">
        <div className="dice-row two">
          <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} bet={{ kind: 'small', value: [] }} label="CHICO" sub="4–10 · 1:1" className="big-cell" />
          <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} bet={{ kind: 'anyTriple', value: [] }} label="Triple" sub="cualquiera · 24:1" />
          <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} bet={{ kind: 'big', value: [] }} label="GRANDE" sub="11–17 · 1:1" className="big-cell" />
        </div>
        <div className="dice-row two">
          <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} bet={{ kind: 'odd', value: [] }} label="Impar" sub="1:1" />
          <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} bet={{ kind: 'even', value: [] }} label="Par" sub="1:1" />
        </div>
        <h3 className="dice-h">Sumas</h3>
        <div className="dice-row totals">
          {Object.keys(TOTAL_PAYS).map(Number).map((t) => <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} key={t} bet={{ kind: 'total', value: [t] }} label={String(t)} sub={`${TOTAL_PAYS[t]}:1`} />)}
        </div>
        <h3 className="dice-h">Dobles (8:1) y triples (150:1)</h3>
        <div className="dice-row six">
          {[1, 2, 3, 4, 5, 6].map((n) => <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} key={`d${n}`} bet={{ kind: 'double', value: [n] }} label={`${n}${n}`} />)}
          {[1, 2, 3, 4, 5, 6].map((n) => <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} key={`t${n}`} bet={{ kind: 'triple', value: [n] }} label={`${n}${n}${n}`} />)}
        </div>
        <h3 className="dice-h">Número (1:1 por cada dado que lo muestre)</h3>
        <div className="dice-row six">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} className="dice-cell die-cell" onClick={() => add({ kind: 'single', value: [n] })} disabled={rolling} aria-label={`Número ${n}, paga 1, 2 o 3 a 1${amountOn({ kind: 'single', value: [n] }) ? `, apuesta ${amountOn({ kind: 'single', value: [n] })}` : ''}`}>
              <DieFace n={n} size={34} />
              {amountOn({ kind: 'single', value: [n] }) ? <span className="spot-chip"><ChipToken value={amountOn({ kind: 'single', value: [n] })} size={24} /></span> : null}
            </button>
          ))}
        </div>
        <h3 className="dice-h">Combinaciones de dos números (5:1)</h3>
        <div className="dice-row combos">
          {[1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6].filter((b) => b > a).map((b) => <DiceCell amountOf={amountOn} onAdd={add} disabled={rolling} key={`c${a}${b}`} bet={{ kind: 'combo', value: [a, b] }} label={`${a}-${b}`} />))}
        </div>
      </section>
    </GameShell>
  );
}
