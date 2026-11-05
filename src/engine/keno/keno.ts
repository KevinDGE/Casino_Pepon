/**
 * Keno: eliges de 1 a 10 números del 1 al 80; se sortean 20.
 * Probabilidades exactas con la distribución hipergeométrica.
 */
import { type Rng, randomInt } from '../../core/rng';

/** KENO_PAYS[spots][aciertos] = devolución total por ficha (0 = pierde). */
export const KENO_PAYS: Record<number, number[]> = {
  1: [0, 3.7],
  2: [0, 1, 9],
  3: [0, 0, 2.5, 42],
  4: [0, 0, 1.5, 7, 100],
  5: [0, 0, 0.5, 3, 20, 500],
  6: [0, 0, 0, 1.5, 7, 110, 1600],
  7: [0, 0, 0, 1, 3, 20, 400, 6000],
  8: [0, 0, 0, 0, 2.5, 15, 80, 1300, 15000],
  9: [0, 0, 0, 0, 1, 6, 40, 400, 4000, 25000],
  10: [2, 0, 0, 0, 0, 3.5, 22, 130, 1100, 5500, 30000],
};

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(k aciertos | n números elegidos). */
export function kenoProb(n: number, k: number): number {
  return (choose(n, k) * choose(80 - n, 20 - k)) / choose(80, 20);
}

export function kenoRTP(n: number): number {
  const pays = KENO_PAYS[n]!;
  let rtp = 0;
  for (let k = 0; k <= n; k++) rtp += kenoProb(n, k) * (pays[k] ?? 0);
  return rtp;
}

/** Sorteo de 20 números distintos (Fisher–Yates parcial sobre 1..80). */
export function kenoDraw(rng: Rng): number[] {
  const pool = Array.from({ length: 80 }, (_, i) => i + 1);
  for (let i = 0; i < 20; i++) {
    const j = i + randomInt(rng, 80 - i);
    const t = pool[i]!; pool[i] = pool[j]!; pool[j] = t;
  }
  return pool.slice(0, 20);
}

export function kenoSettle(picks: readonly number[], drawn: readonly number[], bet: number): { hits: number; returned: number } {
  const set = new Set(drawn);
  const hits = picks.filter((p) => set.has(p)).length;
  const mult = KENO_PAYS[picks.length]?.[hits] ?? 0;
  return { hits, returned: bet * mult };
}
