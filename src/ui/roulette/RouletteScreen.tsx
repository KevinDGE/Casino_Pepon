import { useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Segmented } from '../components/Controls';
import { ChipToken } from '../components/Chip';
import { useProfile, useReducedMotion, uid } from '../store';
import { useHotkeys, useLandscape } from '../hooks';
import { useAnnouncer } from '../announcer';
import { Tutorial } from '../screens/Tutorial';
import { Wheel, WHEEL_STEP, pocketIndex } from './Wheel';
import {
  betKey, colorOf, describeBet, insideBetsContaining, isValidBet, outsideNumbers, payoutFor, settleBets, spin,
  BET_NAMES_ES, type BetKind, type RouletteBet,
} from '../../engine/roulette/roulette';
import { rouletteAdvice, betInfo } from '../../coach/rouletteCoach';
import { CryptoRng } from '../../core/rng';
import { fmtChips, fmtChipsDec, fmtPct, fmtSignedChips } from '../../coach/format';
import { play, vibrate } from '../../audio/sound';
import { WinBurst } from '../arcade/Shell';
import { addResult } from '../../ranking/periods';

const rng = new CryptoRng();
const CHIPS = [1, 5, 25, 100, 500, 1000];
const MAX_PER_BET = 5000;

export function RouletteScreen() {
  const { profile, update } = useProfile();
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const wide = useLandscape();
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [undo, setUndo] = useState<RouletteBet[][]>([]);
  const [mode, setMode] = useState<'straight' | 'combo'>('straight');
  const [picker, setPicker] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rot, setRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [lastNet, setLastNet] = useState<number | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const timer = useRef<number | null>(null);
  const wheelRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!profile.tutorialsSeen.roulette) setTutorial(true); }, [profile.tutorialsSeen.roulette]);
  const pendingSettle = useRef<(() => void) | null>(null);
  // Si se sale durante el giro, el resultado (ya decidido) se liquida igual.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    pendingSettle.current?.();
  }, []);
  const closeTutorial = () => { setTutorial(false); update((d) => { d.tutorialsSeen.roulette = true; }); };

  const total = bets.reduce((a, b) => a + b.amount, 0);
  const advice = useMemo(() => rouletteAdvice(bets), [bets]);
  const recent = profile.history.roulette.slice(0, 18).map((h) => h.result);
  const duration = reduced ? 400 : 4200;

  const addBet = (kind: BetKind, numbers: number[]) => {
    if (spinning || !isValidBet(kind, numbers)) return;
    if (total + chip > profile.chips) { announce('No tienes fichas suficientes para esa apuesta.'); return; }
    const key = betKey({ kind, numbers });
    const existing = bets.find((b) => betKey(b) === key);
    if (existing && existing.amount + chip > MAX_PER_BET) { announce(`Máximo ${fmtChips(MAX_PER_BET)} por apuesta.`); return; }
    setUndo((u) => [...u.slice(-30), bets]);
    setBets(existing ? bets.map((b) => (betKey(b) === key ? { ...b, amount: b.amount + chip } : b)) : [...bets, { kind, numbers: [...numbers].sort((a, b) => a - b), amount: chip }]);
    if (result !== null) { setResult(null); setLastNet(null); }
    play('chip');
    announce(`${describeBet({ kind, numbers })}: ${fmtChips((existing?.amount ?? 0) + chip)}`);
  };

  const doUndo = () => { if (spinning || !undo.length) return; setBets(undo[undo.length - 1]!); setUndo(undo.slice(0, -1)); play('click'); };
  const clear = () => { if (spinning || !bets.length) return; setUndo((u) => [...u, bets]); setBets([]); };
  const repeat = () => {
    if (spinning) return;
    const last = profile.lastBets.roulette as RouletteBet[];
    const sum = last.reduce((a, b) => a + b.amount, 0);
    if (!last.length || sum > profile.chips) return;
    setUndo((u) => [...u, bets]);
    setBets(last.filter((b) => isValidBet(b.kind as BetKind, b.numbers)).map((b) => ({ ...b, kind: b.kind as BetKind })));
    setResult(null);
  };

  const doSpin = () => {
    if (spinning || !bets.length || total > profile.chips) return;
    const n = spin(rng);
    const idx = pocketIndex(n);
    const base = rot - (rot % 360);
    const targetRot = base + 360 * (reduced ? 1 : 5) - idx * WHEEL_STEP;
    setSpinning(true);
    wheelRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    setResult(null);
    setLastNet(null);
    setRot(targetRot);
    setBallRot(ballRot - (ballRot % 360) - 360 * (reduced ? 1 : 8));
    update((d) => { d.chips -= total; d.lastBets.roulette = bets.map((b) => ({ kind: b.kind, numbers: b.numbers, amount: b.amount })); });
    play('tick');
    announce('La bola está girando…');
    if (!reduced) for (let i = 1; i < 14; i++) window.setTimeout(() => play('tick'), i * i * 20);
    const settle = () => {
      pendingSettle.current = null;
      const settled = settleBets(bets, n);
      const returned = settled.reduce((a, b) => a + b.returned, 0);
      const net = returned - total;
      update((d) => {
        d.chips += returned;
        d.ranking = addResult(d.ranking, net);
        const st = d.stats.roulette;
        st.spins++;
        st.wagered += total;
        st.net += net;
        st.expectedLoss += total / 37;
        st.biggestWin = Math.max(st.biggestWin, net);
        st.numbers[n] = (st.numbers[n] ?? 0) + 1;
        for (const b of bets) st.betsByKind[b.kind] = (st.betsByKind[b.kind] ?? 0) + 1;
        d.history.roulette.unshift({ id: uid(), ts: Date.now(), result: n, net, bets: settled.map((b) => ({ desc: describeBet(b), amount: b.amount, net: b.net })) });
      });
      setResult(n);
      setLastNet(net);
      setSpinning(false);
      setBets([]);
      setUndo([]);
      if (net > 0) { play('win'); vibrate(30, profile.settings.haptics); } else play('lose');
      announce(`Salió el ${n} ${colorOf(n) === 'red' ? 'rojo' : colorOf(n) === 'black' ? 'negro' : 'verde'}. ${net > 0 ? `Ganas ${fmtChips(net)}` : net < 0 ? `Pierdes ${fmtChips(-net)}` : 'Recuperas tu apuesta'}.`);
    };
    pendingSettle.current = settle;
    timer.current = window.setTimeout(settle, duration + 80);
  };

  useHotkeys({
    ' ': doSpin, z: doUndo, x: clear, r: repeat, '?': () => setTutorial(true),
    1: () => setChip(CHIPS[0]!), 2: () => setChip(CHIPS[1]!), 3: () => setChip(CHIPS[2]!), 4: () => setChip(CHIPS[3]!), 5: () => setChip(CHIPS[4]!), 6: () => setChip(CHIPS[5]!),
  });

  const amountOn = (kind: BetKind, numbers: number[]) => bets.find((b) => betKey(b) === betKey({ kind, numbers }))?.amount ?? 0;
  const covered = new Set(bets.flatMap((b) => b.numbers));
  const onNumber = (n: number) => (mode === 'straight' ? addBet('straight', [n]) : setPicker(n));

  const numCell = (n: number) => {
    const amt = amountOn('straight', [n]);
    return (
      <button key={n} className={`rcell num-${colorOf(n)} ${result === n ? 'hit' : ''} ${covered.has(n) ? 'covered' : ''}`} onClick={() => onNumber(n)} disabled={spinning}
        aria-label={`Número ${n} ${colorOf(n) === 'red' ? 'rojo' : colorOf(n) === 'black' ? 'negro' : 'verde'}${amt ? `, apuesta ${amt}` : ''}`}>
        <span>{n}</span>
        {amt ? <span className="rcell-chip"><ChipToken value={amt} size={22} /></span> : null}
      </button>
    );
  };
  const outside = (kind: BetKind, label: string, idx = 1, extra = '') => {
    const nums = outsideNumbers(kind, idx);
    const amt = amountOn(kind, nums);
    return (
      <button key={`${kind}${idx}`} className={`rcell rout ${extra}`} onClick={() => addBet(kind, nums)} disabled={spinning} aria-label={`${describeBet({ kind, numbers: nums })}, paga ${payoutFor(nums.length)} a 1${amt ? `, apuesta ${amt}` : ''}`}>
        <span>{label}</span>
        {amt ? <span className="rcell-chip"><ChipToken value={amt} size={22} /></span> : null}
      </button>
    );
  };

  // Paño: vertical (12 filas × 3) o horizontal (3 filas × 12).
  const rows = Array.from({ length: 12 }, (_, r) => [r * 3 + 1, r * 3 + 2, r * 3 + 3]);
  const comboBets = bets.filter((b) => !['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'column'].includes(b.kind));

  return (
    <div className="game-page roulette-page">
      <TopBar title="Ruleta europea" back right={<button className="icon-btn" onClick={() => setTutorial(true)} aria-label="Tutorial y atajos"><Icon name="help" /></button>} />
      <div className={`roulette-layout ${wide ? 'wide' : 'tall'}`}>
        <section className="roulette-left" ref={wheelRef}>
          <Wheel rotation={rot} ballRotation={ballRot} spinning={spinning} duration={duration} result={result} />
          <div className="spin-result" aria-live="off" style={{ position: 'relative' }}>
            {result !== null && lastNet! > 0 ? <WinBurst intensity={lastNet! >= 500 ? 2 : 1} /> : null}
            {result !== null ? (
              <>
                <span className={`num-ball big num-${colorOf(result)} pop-in`}>{result}</span>
                <b className={lastNet! > 0 ? 'good' : lastNet! < 0 ? 'bad' : ''}>{lastNet! > 0 ? `+${fmtChips(lastNet!)}` : lastNet! < 0 ? `−${fmtChips(-lastNet!)}` : 'Sin cambio'}</b>
              </>
            ) : spinning ? <span className="muted">Girando…</span> : <span className="muted">Haz tus apuestas</span>}
          </div>
          <div className="recent" aria-label="Últimos resultados">
            {recent.length ? recent.map((n, i) => <span key={i} className={`num-ball num-${colorOf(n)}`}>{n}</span>) : <span className="muted small">Sin giros todavía</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowOdds(true)}><Icon name="info" size={18} /> Probabilidades y ventaja de la casa</button>
        </section>
        <section className="roulette-right">
          <div className="board-tools">
            <Segmented label="Modo de toque" value={mode} onChange={setMode} options={[{ value: 'straight', label: 'Toque = pleno' }, { value: 'combo', label: 'Elegir combinación' }]} />
          </div>
          <div className={`rboard ${wide ? 'rboard-h' : 'rboard-v'}`} role="group" aria-label="Paño de apuestas">
            <div className="rzero">{numCell(0)}</div>
            <div className="rnums">
              {wide
                ? [3, 2, 1].map((col) => <div key={col} className="rrow">{rows.map((r) => numCell(r[col - 1]!))}</div>)
                : rows.map((r, i) => <div key={i} className="rrow">{r.map(numCell)}</div>)}
            </div>
            <div className="rcols">{(wide ? [3, 2, 1] : [1, 2, 3]).map((c) => outside('column', '2:1', c, 'rcol'))}</div>
          </div>
          <div className="rout-grid">
            <div className="rdozens">{[1, 2, 3].map((d) => outside('dozen', `${d}.ª 12`, d))}</div>
            <div className="reven">
              {outside('low', '1–18')}
              {outside('even', 'Par')}
              {outside('red', 'Rojo', 1, 'rred')}
              {outside('black', 'Negro', 1, 'rblack')}
              {outside('odd', 'Impar')}
              {outside('high', '19–36')}
            </div>
          </div>
          {comboBets.length ? (
            <ul className="combo-list" aria-label="Apuestas combinadas">
              {comboBets.map((b) => (
                <li key={betKey(b)}>
                  <span>{describeBet(b)} · paga {payoutFor(b.numbers.length)}:1</span>
                  <b>{fmtChips(b.amount)}</b>
                  <button className="icon-btn" aria-label={`Quitar ${describeBet(b)}`} disabled={spinning} onClick={() => { setUndo((u) => [...u, bets]); setBets(bets.filter((x) => x !== b)); }}><Icon name="close" size={18} /></button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
      <div className="dock">
        {profile.settings.coach ? (
          <div className="coach-card compact">
            <span className="coach-badge"><Icon name="bulb" size={18} /> Coach</span>
            <span className="coach-rec small">{advice.reasons[0]}</span>
            {total > 0 ? <span className="small muted">{advice.reasons[1]}</span> : null}
          </div>
        ) : null}
        <div className="chip-row" role="radiogroup" aria-label="Valor de ficha">
          {CHIPS.map((v, i) => (
            <button key={v} role="radio" aria-checked={chip === v} className={`chip-pick ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)} aria-label={`Ficha de ${v} (tecla ${i + 1})`}>
              <ChipToken value={v} size={40} />
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={doUndo} disabled={spinning || !undo.length} aria-label="Deshacer"><Icon name="undo" size={18} /> <span className="hide-xs">Deshacer</span></button>
          <button className="btn btn-ghost" onClick={clear} disabled={spinning || !bets.length} aria-label="Limpiar"><Icon name="trash" size={18} /> <span className="hide-xs">Limpiar</span></button>
          <button className="btn btn-ghost" onClick={repeat} disabled={spinning || !profile.lastBets.roulette.length} aria-label="Repetir apuesta"><Icon name="refresh" size={18} /> <span className="hide-xs">Repetir</span></button>
          <button className="btn btn-gold btn-lg" onClick={doSpin} disabled={spinning || !bets.length || total > profile.chips}>Girar {total ? fmtChips(total) : ''}</button>
        </div>
      </div>
      <Modal open={picker !== null} title={picker !== null ? `Apuestas con el ${picker}` : ''} onClose={() => setPicker(null)}>
        {picker !== null ? (
          <ul className="pick-list">
            {insideBetsContaining(picker).map((o) => {
              const info = betInfo(o.numbers.length);
              return (
                <li key={betKey(o)}>
                  <button className="pick-item" onClick={() => { addBet(o.kind, o.numbers); setPicker(null); }}>
                    <span><b>{describeBet(o)}</b><small>{BET_NAMES_ES[o.kind]}</small></span>
                    <span className="pick-odds"><b>{info.payout}:1</b><small>{fmtPct(info.prob, 1)}</small></span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Modal>
      <Modal open={showOdds} title="Probabilidades de la ruleta europea" onClose={() => setShowOdds(false)}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Cubre</th><th>Pago</th><th>Prob.</th><th>EV</th></tr></thead>
            <tbody>
              {[1, 2, 3, 4, 6, 12, 18].map((k) => { const i = betInfo(k); return <tr key={k}><td>{k} {k === 1 ? 'número' : 'números'}</td><td>{i.payout}:1</td><td>{fmtPct(i.prob, 2)}</td><td>{(i.ev * 100).toFixed(2)}%</td></tr>; })}
            </tbody>
          </table>
        </div>
        <div className="callout"><b>Ninguna estrategia elimina la ventaja de la casa.</b> Todas las apuestas pierden en promedio 2.70% de lo apostado. Doblar después de perder (Martingala) o seguir números “calientes” no cambia las probabilidades: cada giro es independiente.</div>
        {total > 0 ? <p>Tus apuestas actuales: {fmtChips(total)} fichas · pérdida esperada {fmtChipsDec(advice.expectedLoss)} · desviación típica {fmtChips(advice.stdDev)} · probabilidad de terminar con ganancia {fmtPct(advice.pProfit, 1)}.</p> : null}
        <p className="muted small">Resultado de tus giros: {fmtSignedChips(profile.stats.roulette.net)} vs. esperado {fmtSignedChips(-profile.stats.roulette.expectedLoss)}.</p>
      </Modal>
      <Tutorial game="roulette" open={tutorial} onClose={closeTutorial} />
    </div>
  );
}
