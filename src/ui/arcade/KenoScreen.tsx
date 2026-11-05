import { useState } from 'react';
import { GameShell, CoachBox, ResultBanner, BetPicker, usePendingSettle } from './Shell';
import { useWallet } from './useWallet';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng, randomInt } from '../../core/rng';
import { KENO_PAYS, kenoDraw, kenoProb, kenoRTP, kenoSettle } from '../../engine/keno/keno';
import { fmtChips, fmtPct } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();

export function KenoScreen() {
  const w = useWallet('keno');
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const pending = usePendingSettle();
  const [picks, setPicks] = useState<number[]>([]);
  const [bet, setBet] = useState(10);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ wagered: number; returned: number; hits: number } | null>(null);
  const n = picks.length;

  const toggle = (x: number) => {
    if (running) return;
    if (last) { setLast(null); setDrawn([]); setShown(0); }
    setPicks((p) => (p.includes(x) ? p.filter((y) => y !== x) : p.length >= 10 ? p : [...p, x].sort((a, b) => a - b)));
    play('click');
  };
  const quick = () => {
    if (running) return;
    const k = n > 0 ? n : 6;
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    const out: number[] = [];
    for (let i = 0; i < k; i++) out.push(pool.splice(randomInt(rng, pool.length), 1)[0]!);
    setPicks(out.sort((a, b) => a - b));
    setLast(null); setDrawn([]); setShown(0);
  };

  const go = () => {
    if (running || n === 0 || bet <= 0 || !w.debit(bet)) return;
    const d = kenoDraw(rng);
    setDrawn(d);
    setShown(0);
    setRunning(true);
    setLast(null);
    const step = reduced ? 10 : 110;
    for (let i = 1; i <= 20; i++) window.setTimeout(() => { setShown(i); if (picks.includes(d[i - 1]!)) play('chip'); else if (!reduced) play('tick'); }, i * step);
    const mine = picks;
    pending.set(() => {
      const s = kenoSettle(mine, d, bet);
      setShown(20);
      setRunning(false);
      w.settle(bet, s.returned, `${s.hits} de ${mine.length} aciertos`);
      setLast({ wagered: bet, returned: s.returned, hits: s.hits });
      play(s.returned > bet ? 'win' : 'lose');
      announce(`${s.hits} aciertos de ${mine.length}. ${s.returned > 0 ? `Cobras ${fmtChips(s.returned)}.` : ''}`);
    });
    window.setTimeout(pending.run, 21 * step + 50);
  };

  useHotkeys({ Enter: go, ' ': go, q: quick, x: () => !running && setPicks([]) });
  const drawnShown = new Set(drawn.slice(0, shown));
  const pays = KENO_PAYS[Math.max(1, n)]!;

  return (
    <GameShell
      game="keno"
      title="Keno"
      dock={
        <>
          <CoachBox
            headline={n ? <>Con {n} {n === 1 ? 'número' : 'números'}, el RTP exacto es <b>{fmtPct(kenoRTP(n), 2)}</b></> : 'Elige de 1 a 10 números'}
            nums={n ? [{ label: 'Pérdida esperada', value: (bet * (1 - kenoRTP(n))).toFixed(1) }, { label: 'Prob. de cobrar algo', value: fmtPct(pays.reduce((a, p, k) => a + (p > 0 ? kenoProb(n, k) : 0), 0), 1) }] : []}
            lines={[
              'Se sortean 20 de 80 números. La probabilidad de cada cantidad de aciertos sigue la distribución hipergeométrica y se muestra en la tabla.',
              'Los números “calientes” o “fríos” no existen: cada sorteo es independiente.',
            ]}
          />
          {last ? <ResultBanner wagered={last.wagered} returned={last.returned} text={`${last.hits} de ${n} aciertos`} /> : null}
          <BetPicker value={bet} onChange={setBet} max={Math.min(w.chips, 1000)} disabled={running} />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={quick} disabled={running}>Al azar <kbd>Q</kbd></button>
            <button className="btn btn-ghost" onClick={() => setPicks([])} disabled={running || !n}>Borrar</button>
            <button className="btn btn-gold btn-lg" onClick={go} disabled={running || !n || bet <= 0 || bet > w.chips}>Sortear · {fmtChips(bet)}</button>
          </div>
        </>
      }
    >
      <div className="keno-layout">
        <section className="keno-board" role="group" aria-label={`Tablero de keno: ${n} de 10 números elegidos`}>
          {Array.from({ length: 80 }, (_, i) => i + 1).map((x) => {
            const picked = picks.includes(x);
            const hit = drawnShown.has(x);
            return (
              <button key={x} className={`keno-num ${picked ? 'picked' : ''} ${hit ? 'drawn' : ''} ${picked && hit ? 'hit' : ''}`} onClick={() => toggle(x)} disabled={running} aria-pressed={picked} aria-label={`${x}${picked ? ', elegido' : ''}${hit ? ', sorteado' : ''}`}>
                {x}
              </button>
            );
          })}
        </section>
        <aside className="keno-pays">
          <h3>Pagos con {Math.max(1, n)} {n === 1 ? 'número' : 'números'}</h3>
          <table className="data-table">
            <thead><tr><th>Aciertos</th><th>Paga</th><th>Probabilidad</th></tr></thead>
            <tbody>
              {pays.map((p, k) => (p > 0 ? (
                <tr key={k} className={last && last.hits === k ? 'hit-row' : ''}><td>{k}</td><td>{p}×</td><td>{kenoProb(Math.max(1, n), k) < 0.001 ? `1 en ${Math.round(1 / kenoProb(Math.max(1, n), k)).toLocaleString('es-MX')}` : fmtPct(kenoProb(Math.max(1, n), k), 1)}</td></tr>
              ) : null)).reverse()}
            </tbody>
          </table>
          <p className="muted small">Paga = devolución total por ficha. Aciertos: {drawn.length ? picks.filter((p) => drawnShown.has(p)).length : 0}.</p>
        </aside>
      </div>
    </GameShell>
  );
}
