/**
 * Representación de cartas: entero 0..51.
 *   rango = c >> 2   (0 = 2, 1 = 3, …, 8 = T, 9 = J, 10 = Q, 11 = K, 12 = A)
 *   palo  = c & 3    (0 = ♠ picas, 1 = ♥ corazones, 2 = ♦ diamantes, 3 = ♣ tréboles)
 */
import { type Rng, shuffleInPlace } from './rng';

export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['picas', 'corazones', 'diamantes', 'tréboles'] as const;
export const RANK_NAMES_ES = [
  'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'jota', 'reina', 'rey', 'as',
] as const;
export const RANK_NAMES_PLURAL_ES = [
  'doses', 'treses', 'cuatros', 'cincos', 'seises', 'sietes', 'ochos', 'nueves', 'dieces',
  'jotas', 'reinas', 'reyes', 'ases',
] as const;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

export function cardToString(c: Card): string {
  return RANK_CHARS[rankOf(c)]! + SUIT_CHARS[suitOf(c)]!;
}

/** Etiqueta legible: "A♠", "10♥". */
export function cardLabel(c: Card): string {
  const r = rankOf(c);
  const rs = r === 8 ? '10' : RANK_CHARS[r]!;
  return rs + SUIT_SYMBOLS[suitOf(c)]!;
}

export function cardAriaLabel(c: Card): string {
  return `${RANK_NAMES_ES[rankOf(c)]} de ${SUIT_NAMES[suitOf(c)]}`;
}

export function parseCard(s: string): Card {
  if (s.length !== 2) throw new Error(`Carta inválida: ${s}`);
  const r = RANK_CHARS.indexOf(s[0]!.toUpperCase());
  const su = SUIT_CHARS.indexOf(s[1]!.toLowerCase());
  if (r < 0 || su < 0) throw new Error(`Carta inválida: ${s}`);
  return makeCard(r, su);
}

/** "As Kd 7c" → [cartas] */
export function parseCards(s: string): Card[] {
  return s.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

export function shuffledDeck(rng: Rng): Card[] {
  return shuffleInPlace(fullDeck(), rng);
}
