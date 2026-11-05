import { fmtChips } from '../../coach/format';

const CHIP_COLORS: [number, string][] = [
  [1000, 'chip-black'],
  [500, 'chip-purple'],
  [100, 'chip-green'],
  [25, 'chip-blue'],
  [5, 'chip-red'],
  [1, 'chip-white'],
];

export function chipClass(v: number): string {
  for (const [min, c] of CHIP_COLORS) if (v >= min) return c;
  return 'chip-white';
}

export function ChipToken({ value, size = 34, label }: { value: number; size?: number; label?: string }) {
  const short = value >= 1000 ? `${value / 1000}K` : String(value);
  return (
    <span className={`chip ${chipClass(value)}`} style={{ width: size, height: size, fontSize: size * 0.32 }} aria-hidden={label ? undefined : true} aria-label={label}>
      {short}
    </span>
  );
}

/** Pila compacta de fichas con el monto. */
export function BetStack({ amount, className = '' }: { amount: number; className?: string }) {
  if (amount <= 0) return null;
  return (
    <span className={`bet-stack pop-in ${className}`} aria-label={`Apuesta de ${fmtChips(amount)} fichas`}>
      <span className={`chip chip-mini ${chipClass(amount)}`} aria-hidden="true" />
      <span className="bet-amount">{fmtChips(amount)}</span>
    </span>
  );
}
