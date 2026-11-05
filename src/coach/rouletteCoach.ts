/**
 * Coach de ruleta: probabilidades, pagos y valor esperado de las apuestas.
 * Mensaje central: ninguna estrategia elimina la ventaja de la casa (2.70 %).
 */
import { payoutFor, winProbability, type RouletteBet } from '../engine/roulette/roulette';
import { fmtChips, fmtChipsDec, fmtPct } from './format';

export const HOUSE_EDGE = 1 / 37;

export interface RouletteAdvice {
  total: number;
  expectedLoss: number;
  /** Probabilidad de que al menos una apuesta gane. */
  pAnyWin: number;
  /** Probabilidad de terminar el giro con ganancia neta. */
  pProfit: number;
  /** Desviación estándar del resultado del giro. */
  stdDev: number;
  reasons: string[];
}

export function rouletteAdvice(bets: readonly RouletteBet[]): RouletteAdvice {
  const total = bets.reduce((a, b) => a + b.amount, 0);
  let pAny = 0;
  let pProfit = 0;
  let mean = 0;
  let m2 = 0;
  for (let n = 0; n <= 36; n++) {
    let ret = 0;
    let any = false;
    for (const b of bets) {
      if (b.numbers.includes(n)) {
        ret += b.amount * (payoutFor(b.numbers.length) + 1);
        any = true;
      }
    }
    const net = ret - total;
    if (any) pAny += 1 / 37;
    if (net > 0) pProfit += 1 / 37;
    mean += net / 37;
    m2 += (net * net) / 37;
  }
  const stdDev = Math.sqrt(Math.max(0, m2 - mean * mean));
  const reasons: string[] = [];
  if (total === 0) {
    reasons.push('Coloca fichas en el paño. Cada apuesta muestra su probabilidad y su pago.');
  } else {
    reasons.push(`Apostaste ${fmtChips(total)}. Pérdida esperada en este giro: ${fmtChipsDec(total * HOUSE_EDGE)} fichas (2.70%).`);
    reasons.push(`Probabilidad de que gane alguna apuesta: ${fmtPct(pAny, 1)}; de terminar con ganancia: ${fmtPct(pProfit, 1)}.`);
    if (bets.length > 1) reasons.push('Cubrir más números sube la probabilidad de acertar, pero baja el pago: el valor esperado sigue siendo −2.70%.');
  }
  reasons.push('Cada giro es independiente: los resultados anteriores no cambian las probabilidades del siguiente.');
  return { total, expectedLoss: total * HOUSE_EDGE, pAnyWin: pAny, pProfit, stdDev, reasons };
}

export function betInfo(numbersCovered: number): { prob: number; payout: number; ev: number } {
  const prob = winProbability(numbersCovered);
  const payout = payoutFor(numbersCovered);
  return { prob, payout, ev: prob * payout - (1 - prob) };
}
