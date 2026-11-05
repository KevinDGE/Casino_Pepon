/**
 * Ventaja aproximada de la casa (con estrategia básica perfecta) según las reglas.
 * Base: 8 mazos, S17, DAS, revisión, re-dividir hasta 4, sin re-dividir ases, 3:2 ≈ 0.43 %.
 * Efectos aditivos de reglas tomados de tablas públicas de análisis combinatorio.
 * Validado por simulación en reports/simulations.md.
 */
import type { BlackjackRules } from './types';

export function estimateHouseEdge(r: BlackjackRules): number {
  let e = 0.43;
  e += ({ 1: -0.48, 2: -0.19, 4: -0.06, 6: -0.03, 8: 0 } as const)[r.decks];
  if (r.dealerHitsSoft17) e += 0.22;
  if (r.blackjackPays === '6:5') e += 1.39;
  if (!r.doubleAfterSplit) e += 0.14;
  if (r.doubleOn === '9-11') e += 0.09;
  if (r.doubleOn === '10-11') e += 0.18;
  if (r.resplitAces) e -= 0.08;
  if (r.hitSplitAces) e -= 0.19;
  if (r.maxHands === 2) e += 0.05;
  if (r.maxHands === 3) e += 0.01;
  if (!r.dealerPeeks) e += 0.11;
  return e / 100;
}
