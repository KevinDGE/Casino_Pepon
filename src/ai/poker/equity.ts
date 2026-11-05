/**
 * Equity por Monte Carlo contra rangos ponderados de varios rivales.
 * Guarda, por muestra, el percentil (dentro de su rango) del rival "más débil
 * que debe continuar", para poder responder rápido a la pregunta:
 * "¿qué equity tengo si sólo me paga el mejor X % de su rango?".
 */
import { type Rng, randomInt, randomFloat } from '../../core/rng';
import { evaluate } from '../../engine/poker/handEval';
import { COMBO_A, COMBO_B, NUM_COMBOS } from './combos';
import type { Range } from './ranges';

export interface OppInput {
  range: Range;
  /** Percentil del combo dentro del rango (0 = el más fuerte). */
  pct: Float64Array;
  /** ¿Puede todavía retirarse ante una apuesta? (no está all-in) */
  responder: boolean;
}

export interface EquityResult {
  equity: number;
  samples: number;
  /** Equity si sólo continúan los combos de los respondedores con percentil ≤ c. */
  eqTop(c: number): number;
}

interface Sampler {
  idx: Int16Array;
  cum: Float64Array;
  total: number;
}

function buildSampler(range: Range, dead: Uint8Array): Sampler {
  const idx: number[] = [];
  const cum: number[] = [];
  let t = 0;
  for (let i = 0; i < NUM_COMBOS; i++) {
    const w = range[i]!;
    if (w <= 0 || dead[COMBO_A[i]!] || dead[COMBO_B[i]!]) continue;
    t += w;
    idx.push(i);
    cum.push(t);
  }
  return { idx: Int16Array.from(idx), cum: Float64Array.from(cum), total: t };
}

function sample(s: Sampler, rng: Rng): number {
  const r = randomFloat(rng) * s.total;
  let lo = 0, hi = s.cum.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (s.cum[m]! <= r) lo = m + 1; else hi = m;
  }
  return s.idx[lo]!;
}

export function equityVsRanges(
  hole: readonly number[],
  board: readonly number[],
  opps: readonly OppInput[],
  iterations: number,
  rng: Rng,
): EquityResult {
  const baseDead = new Uint8Array(52);
  for (const c of hole) baseDead[c] = 1;
  for (const c of board) baseDead[c] = 1;
  const samplers = opps.map((o) => {
    const s = buildSampler(o.range, baseDead);
    // Si el rango quedó vacío (muy improbable), usar cualquier mano.
    if (s.total <= 0) {
      const full = new Float64Array(NUM_COMBOS).fill(1);
      return buildSampler(full, baseDead);
    }
    return s;
  });
  const k = opps.length;
  const outcomes = new Float64Array(iterations);
  const filt = new Float64Array(iterations);
  const dead = new Uint8Array(52);
  const cards = new Array<number>(7);
  const fullBoard = new Array<number>(5);
  const oppCombo = new Int16Array(k);
  let n = 0;
  let guard = 0;
  while (n < iterations && guard < iterations * 20) {
    guard++;
    dead.set(baseDead);
    let ok = true;
    for (let o = 0; o < k; o++) {
      let tries = 0;
      let ci = -1;
      while (tries++ < 12) {
        const cand = sample(samplers[o]!, rng);
        if (!dead[COMBO_A[cand]!] && !dead[COMBO_B[cand]!]) { ci = cand; break; }
      }
      if (ci < 0) { ok = false; break; }
      oppCombo[o] = ci;
      dead[COMBO_A[ci]!] = 1;
      dead[COMBO_B[ci]!] = 1;
    }
    if (!ok) continue;
    for (let i = 0; i < board.length; i++) fullBoard[i] = board[i]!;
    for (let i = board.length; i < 5; i++) {
      let c: number;
      do c = randomInt(rng, 52); while (dead[c]);
      dead[c] = 1;
      fullBoard[i] = c;
    }
    for (let i = 0; i < 5; i++) cards[i + 2] = fullBoard[i]!;
    cards[0] = hole[0]!; cards[1] = hole[1]!;
    const me = evaluate(cards, 7);
    let best = -1, ties = 0;
    let maxPct = 0;
    for (let o = 0; o < k; o++) {
      const ci = oppCombo[o]!;
      cards[0] = COMBO_A[ci]!; cards[1] = COMBO_B[ci]!;
      const sc = evaluate(cards, 7);
      if (sc > best) { best = sc; ties = 1; } else if (sc === best) ties++;
      if (opps[o]!.responder) maxPct = Math.max(maxPct, opps[o]!.pct[ci]!);
    }
    outcomes[n] = me > best ? 1 : me === best ? 1 / (ties + 1) : 0;
    filt[n] = maxPct;
    n++;
  }
  // Ordenar por percentil para consultas eqTop.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => filt[a]! - filt[b]!);
  const sortedPct = new Float64Array(n);
  const prefix = new Float64Array(n + 1);
  let total = 0;
  order.forEach((s, i) => {
    sortedPct[i] = filt[s]!;
    total += outcomes[s]!;
    prefix[i + 1] = total;
  });
  const equity = n > 0 ? total / n : 0.5;
  return {
    equity,
    samples: n,
    eqTop(c: number): number {
      if (n === 0) return 0.5;
      if (c >= 1) return equity;
      let lo = 0, hi = n;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sortedPct[m]! <= c) lo = m + 1; else hi = m; }
      const cnt = Math.max(lo, Math.min(n, 40));
      return prefix[cnt]! / cnt;
    },
  };
}

/** Equity contra N manos completamente aleatorias (usado por el nivel Avanzado). */
export function equityVsRandom(hole: readonly number[], board: readonly number[], numOpps: number, iterations: number, rng: Rng): number {
  const full = new Float64Array(NUM_COMBOS).fill(1);
  const zero = new Float64Array(NUM_COMBOS);
  const opps: OppInput[] = Array.from({ length: Math.max(1, numOpps) }, () => ({ range: full, pct: zero, responder: false }));
  return equityVsRanges(hole, board, opps, iterations, rng).equity;
}
