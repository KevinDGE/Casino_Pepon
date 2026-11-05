/**
 * Las 1,326 combinaciones de dos cartas y sus 169 clases preflop.
 */
import { RANK_CHARS } from '../../core/cards';

export const NUM_COMBOS = 1326;
/** COMBO_A[i] > COMBO_B[i] */
export const COMBO_A = new Uint8Array(NUM_COMBOS);
export const COMBO_B = new Uint8Array(NUM_COMBOS);
/** Clase preflop (0..168) de cada combo. */
export const COMBO_CLASS = new Uint8Array(NUM_COMBOS);
/** Índice de combo a partir de dos cartas: COMBO_INDEX[a*52+b]. */
export const COMBO_INDEX = new Int16Array(52 * 52).fill(-1);

/**
 * Clase: pares 0..12 (rango), suited y offsuit según rangos alto/bajo.
 * Índice = hi*13+lo para suited (hi>lo), lo*13+hi para offsuit, r*13+r para pares.
 */
export function classIndex(c1: number, c2: number): number {
  const r1 = c1 >> 2, r2 = c2 >> 2;
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (hi === lo) return hi * 13 + hi;
  const suited = (c1 & 3) === (c2 & 3);
  return suited ? hi * 13 + lo : lo * 13 + hi;
}

/** Nombre de clase: "AKs", "T9o", "77". */
export function className(idx: number): string {
  const a = Math.floor(idx / 13), b = idx % 13;
  if (a === b) return RANK_CHARS[a]! + RANK_CHARS[a]!;
  if (a > b) return RANK_CHARS[a]! + RANK_CHARS[b]! + 's';
  return RANK_CHARS[b]! + RANK_CHARS[a]! + 'o';
}

/** Número de combos de una clase (6 pares, 4 suited, 12 offsuit). */
export function classCombos(idx: number): number {
  const a = Math.floor(idx / 13), b = idx % 13;
  return a === b ? 6 : a > b ? 4 : 12;
}

(function build() {
  let i = 0;
  for (let a = 1; a < 52; a++) {
    for (let b = 0; b < a; b++) {
      COMBO_A[i] = a;
      COMBO_B[i] = b;
      COMBO_CLASS[i] = classIndex(a, b);
      COMBO_INDEX[a * 52 + b] = i;
      COMBO_INDEX[b * 52 + a] = i;
      i++;
    }
  }
})();

export function comboOf(c1: number, c2: number): number {
  return COMBO_INDEX[c1 * 52 + c2]!;
}
