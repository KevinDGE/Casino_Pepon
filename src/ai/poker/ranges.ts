/**
 * Rangos de manos ponderados (Float64Array de 1,326 combos), fuerza de mano
 * por combo en un tablero, proyectos (draws) y textura del tablero.
 */
import { evaluateHoleBoard, STRAIGHT_HIGH, POPCOUNT } from '../../engine/poker/handEval';
import { COMBO_A, COMBO_B, COMBO_CLASS, NUM_COMBOS, classCombos } from './combos';
import { PREFLOP_EQ_1 } from './preflopData';

export type Range = Float64Array;

/** Clases preflop ordenadas de mejor a peor (equity contra una mano aleatoria). */
export const CLASS_ORDER: number[] = Array.from({ length: 169 }, (_, i) => i).sort(
  (a, b) => PREFLOP_EQ_1[b]! - PREFLOP_EQ_1[a]!,
);
/** Percentil preflop (0 = mejor mano) de cada clase, ponderado por número de combos. */
export const CLASS_PERCENTILE = new Float64Array(169);
(function buildPct() {
  let acc = 0;
  for (const k of CLASS_ORDER) {
    const n = classCombos(k);
    CLASS_PERCENTILE[k] = (acc + n / 2) / NUM_COMBOS;
    acc += n;
  }
})();

export function preflopPercentile(c1: number, c2: number): number {
  const r1 = c1 >> 2, r2 = c2 >> 2;
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  const k = hi === lo ? hi * 13 + hi : (c1 & 3) === (c2 & 3) ? hi * 13 + lo : lo * 13 + hi;
  return CLASS_PERCENTILE[k]!;
}

export function fullRange(): Range {
  return new Float64Array(NUM_COMBOS).fill(1);
}

/** Rango con el mejor `pct` (0..1) de manos preflop. Frontera suave para evitar escalones. */
export function topRange(pct: number, soft = 0.03): Range {
  const r = new Float64Array(NUM_COMBOS);
  for (let i = 0; i < NUM_COMBOS; i++) r[i] = topWeight(CLASS_PERCENTILE[COMBO_CLASS[i]!]!, pct, soft);
  return r;
}

export function topWeight(percentile: number, pct: number, soft = 0.03): number {
  if (percentile <= pct - soft) return 1;
  if (percentile >= pct + soft) return 0;
  return (pct + soft - percentile) / (2 * soft);
}

/** Elimina combos que contienen cartas muertas (conocidas). */
export function removeDead(r: Range, dead: readonly number[]): void {
  if (dead.length === 0) return;
  const d = new Uint8Array(52);
  for (const c of dead) d[c] = 1;
  for (let i = 0; i < NUM_COMBOS; i++) if (d[COMBO_A[i]!] || d[COMBO_B[i]!]) r[i] = 0;
}

export function rangeWeight(r: Range): number {
  let s = 0;
  for (let i = 0; i < NUM_COMBOS; i++) s += r[i]!;
  return s;
}

/** Fracción de todas las manos posibles que representa el rango (0..1). */
export function rangeWidth(r: Range): number {
  return rangeWeight(r) / NUM_COMBOS;
}

export interface BoardStrength {
  /** Fuerza efectiva 0..1 de cada combo (mano hecha + potencial de proyecto). */
  hs: Float64Array;
  /** Percentil de mano hecha 0..1 (1 = la mejor). */
  made: Float64Array;
  /** Outs aproximados de proyecto. */
  outs: Uint8Array;
  /** Puntuación de mano hecha (evaluador). */
  score: Int32Array;
}

const strengthCache = new Map<string, BoardStrength>();

/** Fuerza de cada combo en un tablero (3 a 5 cartas). Se cachea por tablero. */
export function boardStrength(board: readonly number[]): BoardStrength {
  const key = board.join(',');
  const cached = strengthCache.get(key);
  if (cached) return cached;
  const score = new Int32Array(NUM_COMBOS);
  const dead = new Uint8Array(52);
  for (const c of board) dead[c] = 1;
  const valid: number[] = [];
  for (let i = 0; i < NUM_COMBOS; i++) {
    if (dead[COMBO_A[i]!] || dead[COMBO_B[i]!]) { score[i] = -1; continue; }
    score[i] = evaluateHoleBoard(COMBO_A[i]!, COMBO_B[i]!, board);
    valid.push(i);
  }
  // Percentil de mano hecha con empates a la mitad.
  const sorted = valid.map((i) => score[i]!).sort((a, b) => a - b);
  const made = new Float64Array(NUM_COMBOS);
  const n = sorted.length;
  for (const i of valid) {
    const s = score[i]!;
    const lo = lowerBound(sorted, s);
    const hi = upperBound(sorted, s);
    made[i] = (lo + (hi - lo) / 2) / n;
  }
  const outs = new Uint8Array(NUM_COMBOS);
  const hs = new Float64Array(NUM_COMBOS);
  const cardsLeft = 5 - board.length;
  const perOut = cardsLeft === 2 ? 0.04 : cardsLeft === 1 ? 0.021 : 0;
  for (const i of valid) {
    const o = cardsLeft > 0 ? drawOuts(COMBO_A[i]!, COMBO_B[i]!, board, score[i]!) : 0;
    outs[i] = o;
    const drawEq = Math.min(0.6, o * perOut);
    hs[i] = made[i]! + (1 - made[i]!) * drawEq * 0.85;
  }
  const res: BoardStrength = { hs, made, outs, score };
  if (strengthCache.size > 64) strengthCache.clear();
  strengthCache.set(key, res);
  return res;
}

function lowerBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < x) lo = m + 1; else hi = m; }
  return lo;
}
function upperBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! <= x) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * Outs aproximados de proyecto de color y de escalera en los que participa
 * al menos una carta propia. Sólo cuenta si la mano aún no es escalera/color o mejor.
 */
export function drawOuts(h0: number, h1: number, board: readonly number[], score: number): number {
  const cat = score >> 20;
  if (cat >= 4) return 0;
  let outs = 0;
  // Color
  const suitCount = [0, 0, 0, 0];
  const boardSuit = [0, 0, 0, 0];
  for (const c of board) { suitCount[c & 3]!++; boardSuit[c & 3]!++; }
  suitCount[h0 & 3]!++;
  suitCount[h1 & 3]!++;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] === 4 && boardSuit[s]! < 4) outs += 9;
  }
  // Escalera
  let mask = (1 << (h0 >> 2)) | (1 << (h1 >> 2));
  let bmask = 0;
  for (const c of board) { mask |= 1 << (c >> 2); bmask |= 1 << (c >> 2); }
  if (STRAIGHT_HIGH[mask]! < 0) {
    let ranks = 0;
    for (let r = 0; r < 13; r++) {
      const bit = 1 << r;
      if (mask & bit) continue;
      if (STRAIGHT_HIGH[mask | bit]! >= 0 && STRAIGHT_HIGH[bmask | bit]! < 0) ranks++;
    }
    outs += ranks >= 2 ? 8 : ranks === 1 ? 4 : 0;
  }
  // Overcards (sólo flop, mano de carta alta)
  if (cat === 0 && board.length === 3) {
    let boardHigh = 0;
    for (const c of board) boardHigh = Math.max(boardHigh, c >> 2);
    if ((h0 >> 2) > boardHigh) outs += 3;
    if ((h1 >> 2) > boardHigh) outs += 3;
  }
  return Math.min(outs, 20);
}

export interface Texture {
  /** 0 = seco, 1 = muy coordinado. */
  wetness: number;
  paired: boolean;
  monotone: boolean;
  flushPossible: boolean;
  straightPossible: boolean;
  highCard: number;
  description: string;
}

export function boardTexture(board: readonly number[]): Texture {
  if (board.length < 3) {
    return { wetness: 0, paired: false, monotone: false, flushPossible: false, straightPossible: false, highCard: 0, description: '' };
  }
  const suits = [0, 0, 0, 0];
  const ranks = new Array<number>(13).fill(0);
  let mask = 0;
  for (const c of board) { suits[c & 3]!++; ranks[c >> 2]!++; mask |= 1 << (c >> 2); }
  const maxSuit = Math.max(...suits);
  const paired = ranks.some((n) => n >= 2);
  const monotone = maxSuit >= 3 && board.length === 3;
  const flushPossible = maxSuit >= 3;
  const flushDraw = maxSuit === 2 && board.length < 5;
  // Conectividad: ¿cuántas escaleras usan ≥ 3 cartas del tablero?
  let straightPossible = false;
  let connected = 0;
  for (let high = 3; high <= 12; high++) {
    const win = high === 3 ? 0x100f : 0x1f << (high - 4);
    const inBoard = POPCOUNT[mask & win]!;
    if (inBoard >= 3) straightPossible = true;
    if (inBoard >= 2) connected++;
  }
  let wet = 0;
  if (flushPossible) wet += 0.45;
  else if (flushDraw) wet += 0.25;
  if (straightPossible) wet += 0.3;
  wet += Math.min(0.3, connected * 0.04);
  if (paired) wet -= 0.1;
  const wetness = Math.max(0, Math.min(1, wet));
  const highCard = Math.max(...board.map((c) => c >> 2));
  const parts: string[] = [];
  parts.push(wetness >= 0.55 ? 'muy coordinado' : wetness >= 0.3 ? 'algo coordinado' : 'seco');
  if (monotone) parts.push('de un solo palo');
  else if (flushPossible) parts.push('con color posible');
  else if (flushDraw) parts.push('con proyecto de color');
  if (paired) parts.push('pareado');
  if (straightPossible) parts.push('con escalera posible');
  return { wetness, paired, monotone, flushPossible, straightPossible, highCard, description: `Tablero ${parts.join(', ')}` };
}
