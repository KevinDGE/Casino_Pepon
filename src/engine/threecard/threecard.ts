/**
 * Póker de 3 cartas: Ante/Jugar contra el crupier y apuesta opcional Pair Plus.
 * El crupier califica con dama alta o mejor.
 */
import type { Card } from '../../core/cards';
import { type Rng } from '../../core/rng';
import { shuffledDeck } from '../../core/cards';

export type TCHand = 'straightFlush' | 'trips' | 'straight' | 'flush' | 'pair' | 'high';
export const TC_NAMES_ES: Record<TCHand, string> = {
  straightFlush: 'Escalera de color', trips: 'Trío', straight: 'Escalera', flush: 'Color', pair: 'Pareja', high: 'Carta alta',
};
/** Pair Plus (tabla 1-3-6-30-40). */
export const PAIR_PLUS: Record<TCHand, number> = { straightFlush: 40, trips: 30, straight: 6, flush: 3, pair: 1, high: 0 };
/** Bono de Ante (se paga aunque el crupier gane). */
export const ANTE_BONUS: Record<TCHand, number> = { straightFlush: 5, trips: 4, straight: 1, flush: 0, pair: 0, high: 0 };
const CAT_RANK: Record<TCHand, number> = { straightFlush: 5, trips: 4, straight: 3, flush: 2, pair: 1, high: 0 };

/** Puntuación comparable (más alto = mejor) y categoría. */
export function tcScore(cards: readonly Card[]): { score: number; hand: TCHand } {
  const r = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const flush = (cards[0]! & 3) === (cards[1]! & 3) && (cards[1]! & 3) === (cards[2]! & 3);
  const wheel = r[0] === 12 && r[1] === 1 && r[2] === 0; // A-3-2
  const straight = (r[0]! - r[1]! === 1 && r[1]! - r[2]! === 1) || wheel;
  const trips = r[0] === r[1] && r[1] === r[2];
  const pair = !trips && (r[0] === r[1] || r[1] === r[2]);
  let hand: TCHand;
  if (straight && flush) hand = 'straightFlush';
  else if (trips) hand = 'trips';
  else if (straight) hand = 'straight';
  else if (flush) hand = 'flush';
  else if (pair) hand = 'pair';
  else hand = 'high';
  let k: number[];
  if (straight) k = [wheel ? 1 : r[0]!, 0, 0];
  else if (pair) {
    const p = r[0] === r[1] ? r[0]! : r[1]!;
    const kick = r[0] === r[1] ? r[2]! : r[0]!;
    k = [p, kick, 0];
  } else k = r;
  return { score: (CAT_RANK[hand] << 12) | (k[0]! << 8) | (k[1]! << 4) | k[2]!, hand };
}

/** ¿Califica el crupier? (dama alta o mejor) */
export function dealerQualifies(cards: readonly Card[]): boolean {
  const { hand } = tcScore(cards);
  if (hand !== 'high') return true;
  return Math.max(...cards.map((c) => c >> 2)) >= 10;
}

export interface TCRound {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  ante: number;
  pairPlus: number;
}

export function tcDeal(rng: Rng, ante: number, pairPlus: number, deck?: Card[]): TCRound {
  const d = deck ? deck.slice() : shuffledDeck(rng);
  return { deck: d, player: d.slice(0, 3), dealer: d.slice(3, 6), ante, pairPlus };
}

export interface TCResult {
  played: boolean;
  qualifies: boolean;
  outcome: 'win' | 'lose' | 'push' | 'fold' | 'noQualify';
  playerHand: TCHand;
  dealerHand: TCHand;
  /** Neto por componente. */
  anteNet: number;
  playNet: number;
  bonusNet: number;
  pairPlusNet: number;
  net: number;
}

export function tcSettle(round: TCRound, play: boolean): TCResult {
  const p = tcScore(round.player);
  const d = tcScore(round.dealer);
  const pp = round.pairPlus > 0 ? (PAIR_PLUS[p.hand] > 0 ? round.pairPlus * PAIR_PLUS[p.hand] : -round.pairPlus) : 0;
  if (!play) {
    return { played: false, qualifies: dealerQualifies(round.dealer), outcome: 'fold', playerHand: p.hand, dealerHand: d.hand, anteNet: -round.ante, playNet: 0, bonusNet: 0, pairPlusNet: pp, net: -round.ante + pp };
  }
  const bonus = round.ante * ANTE_BONUS[p.hand];
  const q = dealerQualifies(round.dealer);
  let anteNet: number, playNet: number, outcome: TCResult['outcome'];
  if (!q) { anteNet = round.ante; playNet = 0; outcome = 'noQualify'; }
  else if (p.score > d.score) { anteNet = round.ante; playNet = round.ante; outcome = 'win'; }
  else if (p.score < d.score) { anteNet = -round.ante; playNet = -round.ante; outcome = 'lose'; }
  else { anteNet = 0; playNet = 0; outcome = 'push'; }
  return { played: true, qualifies: q, outcome, playerHand: p.hand, dealerHand: d.hand, anteNet, playNet, bonusNet: bonus, pairPlusNet: pp, net: anteNet + playNet + bonus + pp };
}

/**
 * EV exacto (en unidades de Ante, sin Pair Plus) de jugar o retirarse,
 * enumerando las 18,424 manos posibles del crupier con las 49 cartas restantes.
 */
export function tcPlayEV(player: readonly Card[]): { play: number; fold: number } {
  const used = new Uint8Array(52);
  for (const c of player) used[c] = 1;
  const rest: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used[c]) rest.push(c);
  const p = tcScore(player);
  const bonus = ANTE_BONUS[p.hand];
  let total = 0, n = 0;
  const d: Card[] = [0, 0, 0];
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) for (let k = j + 1; k < rest.length; k++) {
    d[0] = rest[i]!; d[1] = rest[j]!; d[2] = rest[k]!;
    let v: number;
    if (!dealerQualifies(d)) v = 1;
    else {
      const ds = tcScore(d).score;
      v = p.score > ds ? 2 : p.score < ds ? -2 : 0;
    }
    total += v + bonus;
    n++;
  }
  return { play: total / n, fold: -1 };
}

/** Estrategia óptima conocida: jugar con Q-6-4 o mejor. */
export function tcOptimalPlay(player: readonly Card[]): boolean {
  const s = tcScore(player);
  if (s.hand !== 'high') return true;
  const r = player.map((c) => c >> 2).sort((a, b) => b - a);
  if (r[0]! > 10) return true; // K o A
  if (r[0]! < 10) return false;
  if (r[1]! > 4) return true; // Q-7+
  if (r[1]! < 4) return false;
  return r[2]! >= 2; // Q-6-4+
}
