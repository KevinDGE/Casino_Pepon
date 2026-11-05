import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TopBar } from '../components/Layout';
import { Icon } from '../components/Icon';
import { ChipToken } from '../components/Chip';
import { Tutorial, type GameId } from '../screens/Tutorial';
import { useProfile, useReducedMotion } from '../store';
import { fmtChips } from '../../coach/format';
import { CryptoRng, randomFloat } from '../../core/rng';

/** Contenedor común: barra superior, tutorial la primera vez, área de juego y dock. */
export function GameShell({ game, title, children, dock, className = '' }: { game: GameId; title: string; children: ReactNode; dock: ReactNode; className?: string }) {
  const { profile, update } = useProfile();
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => { if (!profile.tutorialsSeen[game]) setTutorial(true); }, [profile.tutorialsSeen, game]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === '?' && !document.querySelector('.modal-backdrop')) setTutorial(true); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const close = () => { setTutorial(false); update((d) => { d.tutorialsSeen[game] = true; }); };
  return (
    <div className={`game-page arcade-page ${className}`}>
      <TopBar title={title} back right={<button className="icon-btn" onClick={() => setTutorial(true)} aria-label="Tutorial y atajos"><Icon name="help" /></button>} />
      <main id="main" className="arcade-main" tabIndex={-1}>{children}</main>
      <div className="dock">{dock}</div>
      <Tutorial game={game} open={tutorial} onClose={close} />
    </div>
  );
}

const CHIP_VALUES = [1, 5, 25, 100, 500, 1000];

/** Selector de apuesta: fichas que suman, ½, ×2 y limpiar. */
export function BetPicker({ value, onChange, max, min = 1, label = 'Apuesta', disabled }: {
  value: number; onChange: (v: number) => void; max: number; min?: number; label?: string; disabled?: boolean;
}) {
  const cap = Math.max(0, max);
  const set = (v: number) => onChange(Math.max(0, Math.min(cap, Math.floor(v))));
  return (
    <div className="bet-picker" role="group" aria-label={label}>
      <div className="bet-picker-head">
        <span className="muted small">{label}</span>
        <b className="bet-picker-amount">{fmtChips(value)}</b>
        {value > 0 && value < min ? <span className="small bad">mínimo {min}</span> : null}
      </div>
      <div className="chip-row">
        {CHIP_VALUES.map((v) => (
          <button key={v} className="chip-pick" disabled={disabled || value + v > cap} onClick={() => set(value + v)} aria-label={`Agregar ${v} a ${label.toLowerCase()}`}>
            <ChipToken value={v} size={40} />
          </button>
        ))}
      </div>
      <div className="btn-row tight">
        <button className="btn btn-ghost btn-sm" disabled={disabled || value === 0} onClick={() => set(0)}>Limpiar</button>
        <button className="btn btn-ghost btn-sm" disabled={disabled || value < 2} onClick={() => set(value / 2)}>½</button>
        <button className="btn btn-ghost btn-sm" disabled={disabled || value === 0 || value * 2 > cap} onClick={() => set(value * 2)}>×2</button>
      </div>
    </div>
  );
}

/** Tarjeta del coach / probabilidades (plegable). */
export function CoachBox({ title = 'Coach', headline, nums, lines, defaultOpen = false }: {
  title?: string; headline: ReactNode; nums?: { label: string; value: string; tone?: 'good' | 'bad' }[]; lines?: string[]; defaultOpen?: boolean;
}) {
  const { profile } = useProfile();
  const [open, setOpen] = useState(defaultOpen);
  if (!profile.settings.coach) return null;
  return (
    <div className={`coach-card ${open ? 'open' : ''}`}>
      <div className="coach-head">
        <span className="coach-badge"><Icon name="bulb" size={18} /> {title}</span>
        <span className="coach-rec">{headline}</span>
        {lines && lines.length ? <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ocultar' : '¿Por qué?'}</button> : null}
      </div>
      {nums && nums.length ? (
        <div className="coach-nums">
          {nums.map((n) => <span key={n.label} className={n.tone === 'good' ? 'best' : ''}><small>{n.label}</small><b className={n.tone === 'bad' ? 'bad' : ''}>{n.value}</b></span>)}
        </div>
      ) : null}
      {open && lines ? <div className="coach-body"><ul className="coach-reasons">{lines.map((l) => <li key={l}>{l}</li>)}</ul></div> : null}
    </div>
  );
}

/**
 * Banner de resultado. Sólo celebra cuando hay ganancia neta real; si se
 * recupera parte de la apuesta lo dice claramente (sin disfrazar pérdidas de premios).
 */
export function ResultBanner({ wagered, returned, text }: { wagered: number; returned: number; text?: string }) {
  const net = returned - wagered;
  const big = net > 0 && returned >= wagered * 10;
  return (
    <div className={`result-banner ${net > 0 ? 'win' : net < 0 ? 'loss' : 'push'} ${big ? 'big' : ''}`} role="status">
      {net > 0 ? <WinBurst intensity={big ? 2 : 1} /> : null}
      <b>
        {big ? '¡Gran premio! ' : ''}
        {net > 0 ? `Ganaste ${fmtChips(net)}` : net === 0 ? 'Recuperas tu apuesta' : returned > 0 ? `Recuperas ${fmtChips(returned)} de ${fmtChips(wagered)} (pierdes ${fmtChips(-net)})` : `Pierdes ${fmtChips(-net)}`}
      </b>
      {text ? <small>{text}</small> : null}
    </div>
  );
}

const burstRng = new CryptoRng();

/** Explosión de fichas y confeti (puramente decorativa; se omite con movimiento reducido). */
export function WinBurst({ intensity = 1 }: { intensity?: number }) {
  const reduced = useReducedMotion();
  const parts = useMemo(
    () => Array.from({ length: 18 * intensity }, (_, i) => ({
      i,
      x: (randomFloat(burstRng) - 0.5) * 420,
      y: -80 - randomFloat(burstRng) * 220,
      r: (randomFloat(burstRng) - 0.5) * 720,
      d: 0.9 + randomFloat(burstRng) * 0.8,
      chip: i % 3 === 0,
      hue: ['#f6dc96', '#e3bd62', '#4ade80', '#ff7a85', '#7c9cff'][i % 5]!,
    })),
    [intensity],
  );
  if (reduced) return null;
  return (
    <span className="burst" aria-hidden="true">
      {parts.map((p) => (
        <i
          key={p.i}
          className={p.chip ? 'burst-chip' : 'burst-bit'}
          style={{ ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r}deg`, ['--d' as string]: `${p.d}s`, background: p.chip ? undefined : p.hue }}
        />
      ))}
    </span>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return <span className="mini-stat"><small>{label}</small><b>{value}</b></span>;
}

/**
 * Liquidación pendiente durante una animación. Si la pantalla se cierra antes
 * de terminar, el resultado (ya decidido) se liquida igual: nunca se pierde.
 */
export function usePendingSettle() {
  const ref = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    const f = ref.current;
    ref.current = null;
    f?.();
  }, []);
  return {
    set: (fn: () => void) => { ref.current = fn; },
    run: () => { const f = ref.current; ref.current = null; f?.(); },
  };
}
