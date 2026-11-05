/**
 * Video póker "Jotas o mejor" (tabla completa 9/6).
 * Se reparten 5 cartas, eliges cuáles conservar y se reemplazan las demás
 * con las siguientes cartas del mismo mazo barajado.
 */
import type { Card } from '../../core/cards';
import { type Rng } from '../../core/rng';
import { shuffledDeck } from '../../core/cards';
import { evaluate } from '../poker/handEval';

export type VPHand =
  | 'royal' | 'straightFlush' | 'quads' | 'fullHouse' | 'flush' | 'straight' | 'trips' | 'twoPair' | 'jacksOrBetter' | 'nothing';

/** Pago por ficha apostada (con apuesta máxima la escalera real paga 800). */
export const VP_PAYTABLE: Record<VPHand, number> = {
  royal: 800, straightFlush: 50, quads: 25, fullHouse: 9, flush: 6, straight: 4, trips: 3, twoPair: 2, jacksOrBetter: 1, nothing: 0,
};

export const VP_NAMES_ES: Record<VPHand, string> = {
  royal: 'Escalera real', straightFlush: 'Escalera de color', quads: 'Póker', fullHouse: 'Full', flush: 'Color', straight: 'Escalera',
  trips: 'Trío', twoPair: 'Doble pareja', jacksOrBetter: 'Pareja de jotas o mejor', nothing: 'Sin premio',
};

export const VP_ORDER: VPHand[] = ['royal', 'straightFlush', 'quads', 'fullHouse', 'flush', 'straight', 'trips', 'twoPair', 'jacksOrBetter'];

export function classifyVP(hand: ArrayLike<Card>): VPHand {
  const s = evaluate(hand, 5);
  const cat = s >> 20;
  switch (cat) {
    case 8: return ((s >> 16) & 15) === 12 ? 'royal' : 'straightFlush';
    case 7: return 'quads';
    case 6: return 'fullHouse';
    case 5: return 'flush';
    case 4: return 'straight';
    case 3: return 'trips';
    case 2: return 'twoPair';
    case 1: return ((s >> 16) & 15) >= 9 ? 'jacksOrBetter' : 'nothing';
    default: return 'nothing';
  }
}

export interface VPState {
  deck: Card[];
  pos: number;
  hand: Card[];
  phase: 'deal' | 'draw' | 'done';
  bet: number;
  result: VPHand | null;
  payout: number;
}

export function vpDeal(rng: Rng, bet: number, deck?: Card[]): VPState {
  const d = deck ? deck.slice() : shuffledDeck(rng);
  return { deck: d, pos: 5, hand: d.slice(0, 5), phase: 'draw', bet, result: null, payout: 0 };
}

/** `hold[i]` = conservar la carta i. */
export function vpDraw(state: VPState, hold: readonly boolean[]): VPState {
  if (state.phase !== 'draw') throw new Error('No es momento de cambiar cartas');
  const s: VPState = { ...state, hand: state.hand.slice() };
  for (let i = 0; i < 5; i++) if (!hold[i]) s.hand[i] = s.deck[s.pos++]!;
  s.phase = 'done';
  s.result = classifyVP(s.hand);
  s.payout = s.bet * VP_PAYTABLE[s.result];
  return s;
}

const PAY_BY_CAT = (s: number): number => {
  const cat = s >> 20;
  if (cat === 8) return ((s >> 16) & 15) === 12 ? 800 : 50;
  if (cat === 7) return 25;
  if (cat === 6) return 9;
  if (cat === 5) return 6;
  if (cat === 4) return 4;
  if (cat === 3) return 3;
  if (cat === 2) return 2;
  if (cat === 1) return ((s >> 16) & 15) >= 9 ? 1 : 0;
  return 0;
};

/**
 * EV exacto (por ficha) de cada una de las 32 formas de conservar cartas,
 * enumerando todos los reemplazos posibles con las 47 cartas restantes.
 * Índice = máscara de bits (bit i = conservar la carta i).
 */
export function vpHoldEVs(hand: readonly Card[]): Float64Array {
  const used = new Uint8Array(52);
  for (const c of hand) used[c] = 1;
  const rest: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used[c]) rest.push(c);
  const n = rest.length; // 47
  const evs = new Float64Array(32);
  const h = new Int32Array(5);
  for (let mask = 0; mask < 32; mask++) {
    const held: Card[] = [];
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) held.push(hand[i]!);
    const k = 5 - held.length;
    for (let i = 0; i < held.length; i++) h[i] = held[i]!;
    let total = 0;
    let count = 0;
    const base = held.length;
    if (k === 0) { evs[mask] = PAY_BY_CAT(evaluate(h, 5)); continue; }
    // Enumeración de combinaciones de k cartas entre n.
    const idx = new Int32Array(k);
    for (let i = 0; i < k; i++) idx[i] = i;
    for (;;) {
      for (let i = 0; i < k; i++) h[base + i] = rest[idx[i]!]!;
      total += PAY_BY_CAT(evaluate(h, 5));
      count++;
      let p = k - 1;
      while (p >= 0 && idx[p] === n - k + p) p--;
      if (p < 0) break;
      idx[p]!++;
      for (let q = p + 1; q < k; q++) idx[q] = idx[q - 1]! + 1;
    }
    evs[mask] = total / count;
  }
  return evs;
}

export function bestHold(evs: Float64Array): { mask: number; ev: number } {
  let mask = 0;
  for (let m = 1; m < 32; m++) if (evs[m]! > evs[mask]!) mask = m;
  return { mask, ev: evs[mask]! };
}

export const maskToHold = (mask: number): boolean[] => [0, 1, 2, 3, 4].map((i) => (mask & (1 << i)) !== 0);
export const holdToMask = (hold: readonly boolean[]): number => hold.reduce((m, h, i) => (h ? m | (1 << i) : m), 0);

// ───────── Estrategia rápida (lista clásica para 9/6) — usada en simulaciones ─────────

const HIGH = (r: number) => r >= 9; // J, Q, K, A

/** Conjunto de índices a conservar según la estrategia simple de Jotas o mejor. */
export function vpSimpleStrategy(hand: readonly Card[]): number {
  const r = hand.map((c) => c >> 2);
  const s = hand.map((c) => c & 3);
  const cat = classifyVP(hand);
  const all = 31;
  if (cat === 'royal' || cat === 'straightFlush' || cat === 'quads' || cat === 'fullHouse' || cat === 'flush' || cat === 'straight') {
    if (cat === 'quads') return maskOf(r, (x) => count(r, x) === 4);
    return all;
  }
  const maskWhere = (pred: (i: number) => boolean) => [0, 1, 2, 3, 4].reduce((m, i) => (pred(i) ? m | (1 << i) : m), 0);
  // 4 a escalera real
  for (let suit = 0; suit < 4; suit++) {
    const m = maskWhere((i) => s[i] === suit && r[i]! >= 8);
    if (popcount(m) === 4) return m;
  }
  if (cat === 'trips') return maskOf(r, (x) => count(r, x) === 3);
  // 4 a escalera de color
  const sf4 = suitedStraightDraw(r, s, 4);
  if (sf4) return sf4;
  if (cat === 'twoPair') return maskOf(r, (x) => count(r, x) === 2);
  if (cat === 'jacksOrBetter') return maskOf(r, (x) => count(r, x) === 2);
  // 3 a escalera real
  for (let suit = 0; suit < 4; suit++) {
    const m = maskWhere((i) => s[i] === suit && r[i]! >= 8);
    if (popcount(m) === 3) return m;
  }
  // 4 a color
  for (let suit = 0; suit < 4; suit++) {
    const m = maskWhere((i) => s[i] === suit);
    if (popcount(m) === 4) return m;
  }
  // pareja baja
  const lowPair = maskOf(r, (x) => count(r, x) === 2);
  if (lowPair) return lowPair;
  // 4 a escalera abierta (4 consecutivas sin As en los extremos)
  for (let lo = 0; lo + 3 <= 11; lo++) {
    const want = [lo, lo + 1, lo + 2, lo + 3];
    if (want.every((w) => r.includes(w))) {
      const used = new Set<number>();
      return maskWhere((i) => (want.includes(r[i]!) && !used.has(r[i]!) ? (used.add(r[i]!), true) : false));
    }
  }
  // 2 altas del mismo palo
  for (let suit = 0; suit < 4; suit++) {
    const idx = [0, 1, 2, 3, 4].filter((i) => s[i] === suit && HIGH(r[i]!));
    if (idx.length >= 2) {
      idx.sort((a, b) => r[a]! - r[b]!);
      return (1 << idx[0]!) | (1 << idx[1]!);
    }
  }
  // 3 a escalera de color
  const sf3 = suitedStraightDraw(r, s, 3);
  if (sf3) return sf3;
  // 2 altas distintas (las dos más bajas)
  const highs = [0, 1, 2, 3, 4].filter((i) => HIGH(r[i]!)).sort((a, b) => r[a]! - r[b]!);
  if (highs.length >= 2) return (1 << highs[0]!) | (1 << highs[1]!);
  // 10 con J/Q/K del mismo palo
  for (let i = 0; i < 5; i++) {
    if (r[i] !== 8) continue;
    for (let j = 0; j < 5; j++) if (j !== i && s[j] === s[i] && r[j]! >= 9 && r[j]! <= 11) return (1 << i) | (1 << j);
  }
  if (highs.length === 1) return 1 << highs[0]!;
  return 0;
}

function count(r: number[], x: number): number {
  return r.filter((y) => y === x).length;
}
function maskOf(r: number[], pred: (x: number) => boolean): number {
  return r.reduce((m, x, i) => (pred(x) ? m | (1 << i) : m), 0);
}
function popcount(m: number): number {
  let c = 0;
  while (m) { c += m & 1; m >>= 1; }
  return c;
}
/** Busca `need` cartas del mismo palo que quepan en una ventana de escalera. */
function suitedStraightDraw(r: number[], s: number[], need: number): number {
  for (let suit = 0; suit < 4; suit++) {
    const idx = [0, 1, 2, 3, 4].filter((i) => s[i] === suit);
    if (idx.length < need) continue;
    for (let lo = -1; lo <= 8; lo++) {
      const inWin = idx.filter((i) => {
        const v = r[i] === 12 && lo === -1 ? -1 : r[i]!;
        return v >= lo && v <= lo + 4;
      });
      if (inWin.length >= need) return inWin.slice(0, need).reduce((m, i) => m | (1 << i), 0);
    }
  }
  return 0;
}
