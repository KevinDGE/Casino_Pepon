import type { Card } from '../../core/cards';

/** Valor de blackjack de una carta: 2..10, As = 1 (se ajusta a 11 si conviene). */
export function cardValue(c: Card): number {
  const r = c >> 2;
  if (r === 12) return 1;
  if (r >= 8) return 10;
  return r + 2;
}

export interface HandTotal {
  total: number;
  soft: boolean;
}

export function handTotal(cards: readonly Card[]): HandTotal {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    t += v;
    if (v === 1) aces++;
  }
  if (aces > 0 && t + 10 <= 21) return { total: t + 10, soft: true };
  return { total: t, soft: false };
}

export function totalFromValues(values: readonly number[]): HandTotal {
  let t = 0;
  let aces = 0;
  for (const v of values) {
    t += v;
    if (v === 1) aces++;
  }
  if (aces > 0 && t + 10 <= 21) return { total: t + 10, soft: true };
  return { total: t, soft: false };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function describeHand(cards: readonly Card[]): string {
  const { total, soft } = handTotal(cards);
  if (isBlackjack(cards)) return 'Blackjack';
  if (total > 21) return `${total} (te pasaste)`;
  return soft ? `${total - 10}/${total}` : `${total}`;
}
