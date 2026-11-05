/**
 * Mayor o Menor: se muestra una carta y apuestas si la siguiente será mayor,
 * menor o igual (por rango, As alto). El pago se calcula con las cartas que
 * quedan en el mazo y una ventaja fija de la casa del 3 %.
 */
import type { Card } from '../../core/cards';
import { type Rng, shuffleInPlace } from '../../core/rng';
import { fullDeck } from '../../core/cards';

export type HiLoGuess = 'higher' | 'lower' | 'equal';
export const HILO_EDGE = 0.03;

export interface HiLoState {
  deck: Card[];
  pos: number;
  current: Card;
}

export function newHiLo(rng: Rng): HiLoState {
  const deck = shuffleInPlace(fullDeck(), rng);
  return { deck, pos: 1, current: deck[0]! };
}

/** Probabilidades con las cartas restantes del mazo (información visible: cartas ya mostradas). */
export function hiloOdds(state: HiLoState): Record<HiLoGuess, number> {
  const r = state.current >> 2;
  let hi = 0, lo = 0, eq = 0;
  const rest = state.deck.length - state.pos;
  // Cartas restantes = mazo completo menos las ya mostradas (deck[0..pos-1]).
  const seen = new Uint8Array(52);
  for (let i = 0; i < state.pos; i++) seen[state.deck[i]!] = 1;
  for (let c = 0; c < 52; c++) {
    if (seen[c]) continue;
    const x = c >> 2;
    if (x > r) hi++; else if (x < r) lo++; else eq++;
  }
  const n = Math.max(1, rest);
  return { higher: hi / n, lower: lo / n, equal: eq / n };
}

/** Multiplicador (devolución total por ficha) con ventaja del 3 %, redondeado hacia abajo a centésimas. */
export function hiloMultiplier(p: number): number {
  if (p <= 0) return 0;
  return Math.floor(((1 - HILO_EDGE) / p) * 100) / 100;
}

export interface HiLoResult {
  next: Card;
  won: boolean;
  multiplier: number;
  state: HiLoState;
  reshuffled: boolean;
}

export function hiloPlay(state: HiLoState, guess: HiLoGuess, rng: Rng): HiLoResult {
  const odds = hiloOdds(state);
  const mult = hiloMultiplier(odds[guess]);
  if (mult <= 0) throw new Error('Apuesta imposible');
  const next = state.deck[state.pos]!;
  const a = state.current >> 2, b = next >> 2;
  const won = guess === 'higher' ? b > a : guess === 'lower' ? b < a : b === a;
  let s: HiLoState = { deck: state.deck, pos: state.pos + 1, current: next };
  let reshuffled = false;
  if (s.deck.length - s.pos < 6) {
    // Nuevo mazo barajado que conserva la carta visible como carta actual.
    const rest = shuffleInPlace(fullDeck().filter((c) => c !== next), rng);
    s = { deck: [next, ...rest], pos: 1, current: next };
    reshuffled = true;
  }
  return { next, won, multiplier: mult, state: s, reshuffled };
}
