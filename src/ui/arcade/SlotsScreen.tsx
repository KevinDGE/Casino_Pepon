import { useMemo, useState } from 'react';
import { GameShell, CoachBox, ResultBanner, usePendingSettle } from './Shell';
import { useWallet } from './useWallet';
import { SlotIcon } from '../components/Art';
import { Segmented } from '../components/Controls';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng } from '../../core/rng';
import {
  CHERRY_PAYS, LINES, REELS, SYMBOL_NAMES_ES, THREE_PAYS, evaluateStops, exactSlotsRTP, spinSlots, symbolOdds, type SpinResult, type SlotSymbol,
} from '../../engine/slots/slots';
import { fmtChips, fmtPct } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();
const LINE_BETS = [1, 5, 25, 100];
const LINE_COLORS = ['#f6dc96', '#7c9cff', '#4ade80', '#ff7a85', '#c084fc'];

export function SlotsScreen() {
  const w = useWallet('tragamonedas');
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const pending = usePendingSettle();
  const [lines, setLines] = useState(5);
  const [lineBet, setLineBet] = useState(5);
  const [res, setRes] = useState<SpinResult>(() => evaluateStops([3, 11, 20]));
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [last, setLast] = useState<{ wagered: number; returned: number } | null>(null);
  const [showPays, setShowPays] = useState(false);
  const bet = lines * lineBet;
  const any = spinning.some(Boolean);
  const rtp = useMemo(() => exactSlotsRTP(5), []);
  const odds = useMemo(() => symbolOdds(), []);

  const spin = () => {
    if (any || !w.debit(bet)) return;
    const r = spinSlots(rng, lines);
    setLast(null);
    setSpinning([true, true, true]);
    play('tick');
    const base = reduced ? 80 : 650;
    const gap = reduced ? 40 : 380;
    [0, 1, 2].forEach((i) => window.setTimeout(() => {
      setSpinning((s) => s.map((x, k) => (k === i ? false : x)));
      play('click');
    }, base + i * gap));
    pending.set(() => {
      setSpinning([false, false, false]);
      setRes(r);
      const ret = r.totalPay * lineBet;
      w.settle(bet, ret, r.lineWins.length ? `${r.lineWins.length} línea(s) premiada(s)` : 'Sin premio');
      setLast({ wagered: bet, returned: ret });
      play(ret > bet ? 'win' : ret > 0 ? 'chip' : 'lose');
      announce(ret > 0 ? `Premio de ${fmtChips(ret)} en ${r.lineWins.length} línea(s).` : 'Sin premio.');
    });
    // El resultado se muestra al detener el primer carrete; se liquida al detenerse el último.
    window.setTimeout(() => setRes(r), base - 10);
    window.setTimeout(pending.run, base + 2 * gap + 60);
  };

  useHotkeys({ ' ': spin, Enter: spin });
  const winLines = !any && last ? res.lineWins.map((l) => l.line) : [];

  return (
    <GameShell
      game="tragamonedas"
      title="Fiesta Pepona"
      className="slots-page"
      dock={
        <>
          <CoachBox
            title="Transparencia"
            headline={<>RTP exacto: <b>{fmtPct(rtp.rtp, 2)}</b> · ventaja de la casa {fmtPct(1 - rtp.rtp, 2)}</>}
            nums={[{ label: 'Giros con premio', value: fmtPct(rtp.hitRate, 1) }, { label: 'Pérdida esperada por giro', value: (bet * (1 - rtp.rtp)).toFixed(1) }]}
            lines={[
              `Calculado revisando las ${rtp.combos.toLocaleString('es-MX')} combinaciones de paradas posibles, no con una simulación.`,
              'Los carretes se detienen en posiciones uniformes de su tira real: no hay símbolos “casi” colocados a propósito.',
              'No hay giro automático: cada giro es una decisión tuya. Jugar más líneas no cambia el RTP, sólo cuánto apuestas por giro.',
            ]}
          />
          {last ? <ResultBanner wagered={last.wagered} returned={last.returned} /> : null}
          <div className="slots-controls">
            <div><span className="muted small">Líneas</span><Segmented label="Líneas" value={lines} onChange={(v) => !any && setLines(v)} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} /></div>
            <div><span className="muted small">Por línea</span><Segmented label="Apuesta por línea" value={lineBet} onChange={(v) => !any && setLineBet(v)} options={LINE_BETS.map((v) => ({ value: v, label: String(v) }))} /></div>
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setShowPays(!showPays)} aria-expanded={showPays}>Tabla de pagos</button>
            <button className="btn btn-gold btn-lg" onClick={spin} disabled={any || bet > w.chips}>Girar · {fmtChips(bet)} <kbd>Espacio</kbd></button>
          </div>
        </>
      }
    >
      <section className="slot-machine">
        <div className="slot-marquee" aria-hidden="true"><span>FIESTA</span><span className="slot-marquee-p">PEPONA</span></div>
        <div className="slot-window" role="img" aria-label={`Carretes: ${res.grid.map((col) => col.map((s) => SYMBOL_NAMES_ES[s]).join(', ')).join(' | ')}`}>
          {[0, 1, 2].map((r) => (
            <div key={r} className={`reel ${spinning[r] ? 'spinning' : 'stopped'}`}>
              {spinning[r] && !reduced ? (
                <div className="reel-blur" aria-hidden="true">
                  {[...REELS[r]!, ...REELS[r]!.slice(0, 6)].map((s, i) => <span key={i} className="reel-sym"><SlotIcon s={s} size={56} /></span>)}
                </div>
              ) : (
                res.grid[r]!.map((s, row) => (
                  <span key={row} className={`reel-sym ${winLines.some((l) => LINES[l]![r] === row) ? 'win' : ''}`}><SlotIcon s={s} size={64} /></span>
                ))
              )}
            </div>
          ))}
          <svg className="slot-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
            {LINES.slice(0, lines).map((ln, i) => {
              const y = (row: number) => 50 + row * 100;
              const on = winLines.includes(i);
              return <polyline key={i} points={`10,${y(ln[0])} 150,${y(ln[1])} 290,${y(ln[2])}`} fill="none" stroke={LINE_COLORS[i]} strokeWidth={on ? 7 : 2} opacity={on ? 1 : 0.28} strokeLinecap="round" className={on ? 'line-win' : ''} />;
            })}
          </svg>
        </div>
        {showPays ? (
          <table className="slot-pays">
            <thead><tr><th>Símbolos</th><th>Paga (× por línea)</th><th>Prob. por línea</th></tr></thead>
            <tbody>
              {odds.map((o) => (
                <tr key={o.symbol}>
                  <td><span className="pay-syms">{[0, 1, 2].map((i) => <SlotIcon key={i} s={o.symbol as SlotSymbol} size={22} />)}</span> {SYMBOL_NAMES_ES[o.symbol]}</td>
                  <td>{THREE_PAYS[o.symbol]}</td>
                  <td>1 en {Math.round(1 / o.prob).toLocaleString('es-MX')}</td>
                </tr>
              ))}
              <tr><td><span className="pay-syms"><SlotIcon s="cereza" size={22} /><SlotIcon s="cereza" size={22} /></span> Dos cerezas a la izquierda</td><td>{CHERRY_PAYS.two}</td><td>—</td></tr>
            </tbody>
          </table>
        ) : null}
      </section>
    </GameShell>
  );
}
