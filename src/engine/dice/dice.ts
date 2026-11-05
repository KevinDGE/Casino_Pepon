/**
 * "Tres Dados" (estilo Sic Bo). Se lanzan 3 dados; el EV de cada apuesta se
 * calcula exactamente enumerando los 216 resultados.
 */
import { type Rng, randomInt } from '../../core/rng';

export type DiceBetKind = 'small' | 'big' | 'odd' | 'even' | 'total' | 'triple' | 'anyTriple' | 'double' | 'single' | 'combo';

export interface DiceBet {
  kind: DiceBetKind;
  /** total: suma; triple/double/single: cara; combo: [a, b]. */
  value: number[];
}

export const TOTAL_PAYS: Record<number, number> = { 4: 50, 5: 18, 6: 14, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 14, 16: 18, 17: 50 };
export const DICE_PAYS = { small: 1, big: 1, odd: 1, even: 1, triple: 150, anyTriple: 24, double: 8, combo: 5 } as const;

export type Roll = [number, number, number];

export function rollDice(rng: Rng): Roll {
  return [1 + randomInt(rng, 6), 1 + randomInt(rng, 6), 1 + randomInt(rng, 6)];
}

/** Ganancia por ficha ("a 1"); −1 si pierde. */
export function diceNet(bet: DiceBet, roll: Roll): number {
  const [a, b, c] = roll;
  const sum = a + b + c;
  const triple = a === b && b === c;
  const cnt = (x: number) => roll.filter((y) => y === x).length;
  switch (bet.kind) {
    case 'small': return !triple && sum >= 4 && sum <= 10 ? 1 : -1;
    case 'big': return !triple && sum >= 11 && sum <= 17 ? 1 : -1;
    case 'odd': return !triple && sum % 2 === 1 ? 1 : -1;
    case 'even': return !triple && sum % 2 === 0 ? 1 : -1;
    case 'total': return sum === bet.value[0] ? TOTAL_PAYS[sum]! : -1;
    case 'triple': return triple && a === bet.value[0] ? DICE_PAYS.triple : -1;
    case 'anyTriple': return triple ? DICE_PAYS.anyTriple : -1;
    case 'double': return cnt(bet.value[0]!) >= 2 ? DICE_PAYS.double : -1;
    case 'single': { const k = cnt(bet.value[0]!); return k === 0 ? -1 : k; }
    case 'combo': return cnt(bet.value[0]!) >= 1 && cnt(bet.value[1]!) >= 1 && bet.value[0] !== bet.value[1] ? DICE_PAYS.combo : -1;
  }
}

/** EV exacto por ficha y probabilidad de ganar. */
export function diceStats(bet: DiceBet): { ev: number; pWin: number } {
  let ev = 0, w = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
    const n = diceNet(bet, [a, b, c]);
    ev += n / 216;
    if (n > 0) w += 1 / 216;
  }
  return { ev, pWin: w };
}

export function describeDiceBet(b: DiceBet): string {
  switch (b.kind) {
    case 'small': return 'Chico (4–10)';
    case 'big': return 'Grande (11–17)';
    case 'odd': return 'Impar';
    case 'even': return 'Par';
    case 'total': return `Suma ${b.value[0]}`;
    case 'triple': return `Triple de ${b.value[0]}`;
    case 'anyTriple': return 'Cualquier triple';
    case 'double': return `Doble de ${b.value[0]}`;
    case 'single': return `Número ${b.value[0]}`;
    case 'combo': return `Combinación ${b.value[0]}-${b.value[1]}`;
  }
}

export const diceKey = (b: DiceBet): string => `${b.kind}:${b.value.join('-')}`;

export function payLabel(b: DiceBet): string {
  if (b.kind === 'single') return '1:1 · 2:1 · 3:1';
  if (b.kind === 'total') return `${TOTAL_PAYS[b.value[0]!]}:1`;
  return `${DICE_PAYS[b.kind as keyof typeof DICE_PAYS]}:1`;
}
