/**
 * Evaluador de manos de póker de 5 a 7 cartas.
 *
 * Devuelve un entero donde "más alto = mejor mano". Formato:
 *   bits 20..23: categoría (0 carta alta … 8 escalera de color)
 *   bits 0..19 : hasta 5 rangos en nibbles (desempates), del más al menos importante.
 *
 * Usa tablas precalculadas de 8192 entradas (máscaras de 13 bits) para
 * escaleras, popcount y "top 5", de modo que no hay asignaciones de memoria
 * en el camino caliente (Monte Carlo evalúa millones de manos).
 */
import type { Card } from '../../core/cards';
import { RANK_NAMES_ES, RANK_NAMES_PLURAL_ES } from '../../core/cards';

export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export const CATEGORY_NAMES_ES = [
  'Carta alta',
  'Pareja',
  'Doble pareja',
  'Trío',
  'Escalera',
  'Color',
  'Full',
  'Póker',
  'Escalera de color',
] as const;

const STRAIGHT_HIGH = new Int8Array(8192);
const POPCOUNT = new Uint8Array(8192);
const TOP5 = new Int32Array(8192);
/** Rango más alto presente en la máscara (-1 si vacía). */
const HIGHEST = new Int8Array(8192);

(function buildTables() {
  for (let m = 0; m < 8192; m++) {
    let pc = 0;
    for (let b = 0; b < 13; b++) if (m & (1 << b)) pc++;
    POPCOUNT[m] = pc;
    let sh = -1;
    for (let high = 12; high >= 4; high--) {
      const mask = 0x1f << (high - 4);
      if ((m & mask) === mask) {
        sh = high;
        break;
      }
    }
    if (sh < 0 && (m & 0x100f) === 0x100f) sh = 3; // rueda A-2-3-4-5
    STRAIGHT_HIGH[m] = sh;
    let enc = 0;
    let taken = 0;
    for (let b = 12; b >= 0 && taken < 5; b--) {
      if (m & (1 << b)) {
        enc |= b << (16 - 4 * taken);
        taken++;
      }
    }
    TOP5[m] = enc;
    let hi = -1;
    for (let b = 12; b >= 0; b--) if (m & (1 << b)) { hi = b; break; }
    HIGHEST[m] = hi;
  }
})();

const counts = new Int32Array(13);

/** Evalúa entre 5 y 7 cartas. */
export function evaluate(cards: ArrayLike<Card>, len: number = cards.length): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  counts.fill(0);
  for (let i = 0; i < len; i++) {
    const c = cards[i]!;
    const r = c >> 2;
    const bit = 1 << r;
    switch (c & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit; break;
    }
    counts[r]!++;
  }
  return scoreFromMasks(s0, s1, s2, s3);
}

/** Variante para 2 cartas propias + tablero (evita concatenar arrays). */
export function evaluateHoleBoard(h0: Card, h1: Card, board: ArrayLike<Card>, boardLen: number = board.length): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  counts.fill(0);
  for (let i = -2; i < boardLen; i++) {
    const c = i === -2 ? h0 : i === -1 ? h1 : board[i]!;
    const r = c >> 2;
    const bit = 1 << r;
    switch (c & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit; break;
    }
    counts[r]!++;
  }
  return scoreFromMasks(s0, s1, s2, s3);
}

function scoreFromMasks(s0: number, s1: number, s2: number, s3: number): number {
  let flush = 0;
  if (POPCOUNT[s0]! >= 5) flush = s0;
  else if (POPCOUNT[s1]! >= 5) flush = s1;
  else if (POPCOUNT[s2]! >= 5) flush = s2;
  else if (POPCOUNT[s3]! >= 5) flush = s3;
  if (flush) {
    const sf = STRAIGHT_HIGH[flush]!;
    if (sf >= 0) return (8 << 20) | (sf << 16);
    // Con 7 cartas no puede haber color y póker/full a la vez con la misma… sí puede: se
    // comprueba abajo. Póker y full superan al color.
  }
  let quad = -1, trip1 = -1, trip2 = -1, pair1 = -1, pair2 = -1, pair3 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = counts[r]!;
    if (n === 4) quad = r;
    else if (n === 3) {
      if (trip1 < 0) trip1 = r; else if (trip2 < 0) trip2 = r;
    } else if (n === 2) {
      if (pair1 < 0) pair1 = r; else if (pair2 < 0) pair2 = r; else if (pair3 < 0) pair3 = r;
    }
  }
  const all = s0 | s1 | s2 | s3;
  if (quad >= 0) {
    const k = HIGHEST[all & ~(1 << quad)]!;
    return (7 << 20) | (quad << 16) | (k << 12);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    const p = Math.max(trip2, pair1);
    return (6 << 20) | (trip1 << 16) | (p << 12);
  }
  if (flush) return (5 << 20) | TOP5[flush]!;
  const st = STRAIGHT_HIGH[all]!;
  if (st >= 0) return (4 << 20) | (st << 16);
  if (trip1 >= 0) {
    const rest = all & ~(1 << trip1);
    const k1 = HIGHEST[rest]!;
    const k2 = HIGHEST[rest & ~(1 << k1)]!;
    return (3 << 20) | (trip1 << 16) | (k1 << 12) | (k2 << 8);
  }
  if (pair2 >= 0) {
    const k = HIGHEST[all & ~(1 << pair1) & ~(1 << pair2)]!;
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (k << 8);
  }
  if (pair1 >= 0) {
    const rest = all & ~(1 << pair1);
    const k1 = HIGHEST[rest]!;
    const r2 = rest & ~(1 << k1);
    const k2 = HIGHEST[r2]!;
    const k3 = HIGHEST[r2 & ~(1 << k2)]!;
    return (1 << 20) | (pair1 << 16) | (k1 << 12) | (k2 << 8) | (k3 << 4);
  }
  return TOP5[all]!;
}

export function categoryOf(score: number): HandCategory {
  return (score >> 20) as HandCategory;
}

/** Descripción en español: "Full de reyes con treses", "Escalera real", etc. */
export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const r = (i: number) => (score >> (16 - 4 * i)) & 15;
  switch (cat) {
    case HandCategory.StraightFlush:
      return r(0) === 12 ? 'Escalera real' : `Escalera de color al ${RANK_NAMES_ES[r(0)]}`;
    case HandCategory.Quads:
      return `Póker de ${RANK_NAMES_PLURAL_ES[r(0)]}`;
    case HandCategory.FullHouse:
      return `Full de ${RANK_NAMES_PLURAL_ES[r(0)]} con ${RANK_NAMES_PLURAL_ES[r(1)]}`;
    case HandCategory.Flush:
      return `Color al ${RANK_NAMES_ES[r(0)]}`;
    case HandCategory.Straight:
      return `Escalera al ${RANK_NAMES_ES[r(0)]}`;
    case HandCategory.Trips:
      return `Trío de ${RANK_NAMES_PLURAL_ES[r(0)]}`;
    case HandCategory.TwoPair:
      return `Doble pareja: ${RANK_NAMES_PLURAL_ES[r(0)]} y ${RANK_NAMES_PLURAL_ES[r(1)]}`;
    case HandCategory.Pair:
      return `Pareja de ${RANK_NAMES_PLURAL_ES[r(0)]}`;
    default:
      return `Carta alta: ${RANK_NAMES_ES[r(0)]}`;
  }
}

/** Mejores 5 cartas (para resaltar en el showdown). Fuerza bruta: ≤ 21 combinaciones. */
export function bestFive(cards: readonly Card[]): Card[] {
  if (cards.length <= 5) return [...cards];
  let best = -1;
  let bestCombo: Card[] = cards.slice(0, 5);
  const n = cards.length;
  const combo: Card[] = [0, 0, 0, 0, 0];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            combo[0] = cards[a]!; combo[1] = cards[b]!; combo[2] = cards[c]!; combo[3] = cards[d]!; combo[4] = cards[e]!;
            const s = evaluate(combo, 5);
            if (s > best) {
              best = s;
              bestCombo = combo.slice();
            }
          }
  return bestCombo;
}
