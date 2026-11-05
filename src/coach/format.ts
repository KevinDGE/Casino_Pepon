/** Utilidades de formato en español de México. */
const nf = new Intl.NumberFormat('es-MX');
export const fmtChips = (n: number): string => nf.format(Math.round(n));
export const fmtPct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;
export const fmtSignedChips = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '') + nf.format(Math.abs(Math.round(n)));
export const fmtBB = (chips: number, bb: number): string => {
  const v = chips / bb;
  const s = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
  return `${s.replace('-', '−')} BB`;
};
