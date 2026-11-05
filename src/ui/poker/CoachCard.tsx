import { useState } from 'react';
import type { PokerAdvice } from '../../coach/pokerCoach';
import { fmtBB, fmtPct } from '../../coach/format';
import { Icon } from '../components/Icon';
import type { PokerAction } from '../../engine/poker/types';

export function CoachCard({ advice, loading, onApply }: { advice: PokerAdvice | null; loading: boolean; onApply: (a: PokerAction) => void }) {
  const [open, setOpen] = useState(false);
  if (loading && !advice) {
    return (
      <div className="coach-card" aria-busy="true">
        <span className="coach-badge"><Icon name="bulb" size={18} /> Coach</span>
        <span className="coach-loading">Calculando equity y valor esperado…</span>
      </div>
    );
  }
  if (!advice) return null;
  const bb = advice.bigBlind;
  return (
    <div className={`coach-card ${open ? 'open' : ''}`}>
      <div className="coach-head">
        <span className="coach-badge"><Icon name="bulb" size={18} /> Coach</span>
        <span className="coach-rec">Te recomiendo: <b>{advice.recommended.label}</b></span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Ocultar' : '¿Por qué?'} <kbd>K</kbd>
        </button>
      </div>
      <div className="coach-nums">
        <span title="Probabilidad de ganar el bote contra los rangos estimados"><small>Equity</small><b>{fmtPct(advice.equity)}</b></span>
        {advice.toCall > 0 ? <span title="Equity mínima para que pagar sea rentable"><small>Necesitas</small><b>{fmtPct(advice.potOdds)}</b></span> : null}
        {advice.openChart ? (
          <span title="Rango de apertura recomendado para tu posición"><small>Abrir con</small><b>top {fmtPct(advice.openPct)}</b></span>
        ) : (
          <span><small>EV mejor</small><b>{fmtBB(advice.recommended.evBB * bb, bb)}</b></span>
        )}
        {advice.openChart ? <span><small>Tu mano</small><b>top {fmtPct(Math.max(0.01, advice.handPct))}</b></span> : null}
        {advice.street !== 'preflop' ? <span><small>SPR</small><b>{advice.spr > 50 ? '∞' : advice.spr.toFixed(1)}</b></span> : null}
      </div>
      {open ? (
        <div className="coach-body">
          <ul className="coach-reasons">
            {advice.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          {advice.openChart ? null : <div className="coach-table" role="table" aria-label="Valor esperado de cada opción">
            {advice.options.slice(0, 5).map((o, i) => (
              <div role="row" key={`${o.kind}-${o.to}`} className={i === 0 ? 'best' : ''}>
                <span role="cell">{o.label}</span>
                <span role="cell">{fmtBB(o.evBB * bb, bb)}</span>
              </div>
            ))}
          </div>}
          {advice.opponents.length ? (
            <div className="coach-opps">
              {advice.opponents.map((o) => (
                <span key={o.name}><b>{o.name}:</b> {o.style}{o.hands >= 8 ? ` · juega ${fmtPct(o.vpip)} de manos` : ''} · rango estimado {fmtPct(o.width)}</span>
              ))}
            </div>
          ) : null}
          <button className="btn btn-gold btn-sm" onClick={() => onApply(advice.recommended.action)}>Hacer la jugada recomendada</button>
          <p className="muted small">El EV (valor esperado) se mide en ciegas grandes (BB) y es una estimación: los rangos del rival se deducen de sus acciones, nunca de sus cartas.</p>
        </div>
      ) : null}
    </div>
  );
}
