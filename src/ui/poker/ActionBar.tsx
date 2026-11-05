import { useEffect, useMemo, useState } from 'react';
import type { LegalActions, PokerAction } from '../../engine/poker/types';
import { fmtChips } from '../../coach/format';

interface Props {
  legal: LegalActions;
  pot: number;
  currentBet: number;
  myBet: number;
  bigBlind: number;
  disabled: boolean;
  onAct: (a: PokerAction) => void;
  raiseOpen: boolean;
  setRaiseOpen: (v: boolean) => void;
}

/** Botones de acción grandes (pulgar) y panel de subida con presets y deslizador. */
export function ActionBar({ legal, pot, currentBet, myBet, bigBlind, disabled, onAct, raiseOpen, setRaiseOpen }: Props) {
  const isBet = currentBet === 0;
  const presets = useMemo(() => {
    if (!legal.canRaise) return [];
    const potAfterCall = pot + legal.toCall;
    const mk = (label: string, to: number) => ({ label, to: Math.round(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, to))) });
    const list = [
      mk('Mín.', legal.minRaiseTo),
      mk('½ bote', isBet ? pot * 0.5 : currentBet + potAfterCall * 0.5),
      mk('¾ bote', isBet ? pot * 0.75 : currentBet + potAfterCall * 0.75),
      mk('Bote', isBet ? pot : currentBet + potAfterCall),
      mk('All-in', legal.maxRaiseTo),
    ];
    const seen = new Set<number>();
    return list.filter((p) => (seen.has(p.to) ? false : (seen.add(p.to), true)));
  }, [legal, pot, currentBet, isBet]);
  const [amount, setAmount] = useState(legal.minRaiseTo);
  useEffect(() => setAmount(legal.minRaiseTo), [legal.minRaiseTo, legal.maxRaiseTo]);
  const step = Math.max(1, Math.round(bigBlind / 2));
  const clampAmt = (v: number) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(v)));

  useEffect(() => {
    if (!raiseOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setAmount((a) => clampAmt(a + bigBlind)); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setAmount((a) => clampAmt(a - bigBlind)); }
      if (e.key === 'Enter') { e.preventDefault(); onAct({ type: 'raise', to: amount }); setRaiseOpen(false); }
      if (e.key === 'Escape') { e.preventDefault(); setRaiseOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const allInLabel = amount >= legal.maxRaiseTo;
  const raiseVerb = isBet ? 'Apostar' : 'Subir a';
  return (
    <div className="action-bar" role="group" aria-label="Tus acciones">
      {raiseOpen && legal.canRaise ? (
        <div className="raise-panel slide-up">
          <div className="raise-presets">
            {presets.map((p) => (
              <button key={p.label} className={`chip-btn ${p.to === amount ? 'active' : ''}`} onClick={() => setAmount(p.to)} disabled={disabled}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="raise-row">
            <button className="icon-btn big" aria-label="Disminuir apuesta" onClick={() => setAmount((a) => clampAmt(a - bigBlind))} disabled={disabled || amount <= legal.minRaiseTo}>−</button>
            <input
              type="range"
              className="raise-slider"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={step}
              value={amount}
              onChange={(e) => setAmount(clampAmt(Number(e.target.value)))}
              aria-label="Cantidad a apostar"
              aria-valuetext={`${fmtChips(amount)} fichas`}
            />
            <button className="icon-btn big" aria-label="Aumentar apuesta" onClick={() => setAmount((a) => clampAmt(a + bigBlind))} disabled={disabled || amount >= legal.maxRaiseTo}>+</button>
          </div>
          <div className="raise-info">
            <span>{fmtChips(amount)}</span>
            <small>{pot > 0 ? `${Math.round(((amount - myBet) / Math.max(1, pot)) * 100)}% del bote` : ''}</small>
          </div>
        </div>
      ) : null}
      <div className="action-buttons">
        {legal.canFold ? (
          <button className="act-btn act-fold" disabled={disabled} onClick={() => onAct({ type: 'fold' })}>
            Retirarse <kbd>F</kbd>
          </button>
        ) : null}
        {legal.canCheck ? (
          <button className="act-btn act-check" disabled={disabled} onClick={() => onAct({ type: 'check' })}>
            Pasar <kbd>C</kbd>
          </button>
        ) : null}
        {legal.canCall ? (
          <button className="act-btn act-call" disabled={disabled} onClick={() => onAct({ type: 'call' })}>
            {legal.callAmount < legal.toCall || legal.callAmount === legal.maxRaiseTo - myBet ? 'All-in' : 'Igualar'} {fmtChips(legal.callAmount)} <kbd>C</kbd>
          </button>
        ) : null}
        {legal.canRaise ? (
          raiseOpen ? (
            <button className="act-btn act-raise" disabled={disabled} onClick={() => { onAct({ type: 'raise', to: amount }); setRaiseOpen(false); }}>
              {allInLabel ? `All-in ${fmtChips(amount)}` : `${raiseVerb} ${fmtChips(amount)}`} <kbd>↵</kbd>
            </button>
          ) : (
            <button className="act-btn act-raise" disabled={disabled} onClick={() => setRaiseOpen(true)}>
              {isBet ? 'Apostar' : 'Subir'} <kbd>R</kbd>
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
