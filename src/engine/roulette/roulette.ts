/**
 * Ruleta europea (un solo cero, 37 casillas).
 * Pago de toda apuesta: 36 / (números cubiertos) − 1 a 1  ⇒  EV = −1/37 ≈ −2.70 %.
 */
import { type Rng, randomInt } from '../../core/rng';

/** Orden físico de la rueda europea, en sentido horario desde el cero. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type NumberColor = 'red' | 'black' | 'green';
export const colorOf = (n: number): NumberColor => (n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black');

export type BetKind =
  | 'straight' | 'split' | 'street' | 'corner' | 'sixline' | 'trio' | 'firstfour'
  | 'dozen' | 'column' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';

export interface RouletteBet {
  kind: BetKind;
  numbers: number[];
  amount: number;
}

export const BET_NAMES_ES: Record<BetKind, string> = {
  straight: 'Pleno',
  split: 'Caballo (2 números)',
  street: 'Transversal (3 números)',
  corner: 'Cuadro (4 números)',
  sixline: 'Seisena (6 números)',
  trio: 'Trío con el cero',
  firstfour: 'Primeros cuatro (0-1-2-3)',
  dozen: 'Docena',
  column: 'Columna',
  red: 'Rojo',
  black: 'Negro',
  even: 'Par',
  odd: 'Impar',
  low: 'Falta (1-18)',
  high: 'Pasa (19-36)',
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Columna en el paño (1, 2 o 3). La columna 1 contiene 1, 4, 7, … */
export const columnOf = (n: number): number => (n === 0 ? 0 : ((n - 1) % 3) + 1);
/** Fila (calle) del paño, 1..12. */
export const rowOf = (n: number): number => (n === 0 ? 0 : Math.floor((n - 1) / 3) + 1);

export function outsideNumbers(kind: BetKind, index = 1): number[] {
  switch (kind) {
    case 'red': return range(1, 36).filter((n) => RED_NUMBERS.has(n));
    case 'black': return range(1, 36).filter((n) => !RED_NUMBERS.has(n));
    case 'even': return range(1, 36).filter((n) => n % 2 === 0);
    case 'odd': return range(1, 36).filter((n) => n % 2 === 1);
    case 'low': return range(1, 18);
    case 'high': return range(19, 36);
    case 'dozen': return range((index - 1) * 12 + 1, index * 12);
    case 'column': return range(1, 36).filter((n) => columnOf(n) === index);
    default: throw new Error('No es apuesta exterior');
  }
}

function adjacent(a: number, b: number): boolean {
  if (a > b) [a, b] = [b, a];
  if (a === 0) return b >= 1 && b <= 3;
  if (b - a === 3) return true;
  if (b - a === 1 && rowOf(a) === rowOf(b)) return true;
  return false;
}

/** Valida que una combinación de números sea una apuesta real del paño. */
export function isValidBet(kind: BetKind, numbers: readonly number[]): boolean {
  const ns = [...numbers].sort((a, b) => a - b);
  if (new Set(ns).size !== ns.length || ns.some((n) => !Number.isInteger(n) || n < 0 || n > 36)) return false;
  const same = (xs: number[]) => xs.length === ns.length && xs.every((x, i) => x === ns[i]);
  switch (kind) {
    case 'straight': return ns.length === 1;
    case 'split': return ns.length === 2 && adjacent(ns[0]!, ns[1]!);
    case 'street': return ns.length === 3 && ns[0]! >= 1 && columnOf(ns[0]!) === 1 && same([ns[0]!, ns[0]! + 1, ns[0]! + 2]);
    case 'corner': {
      const a = ns[0]!;
      return ns.length === 4 && a >= 1 && columnOf(a) !== 3 && a <= 32 && same([a, a + 1, a + 3, a + 4]);
    }
    case 'sixline': {
      const a = ns[0]!;
      return ns.length === 6 && a >= 1 && columnOf(a) === 1 && a <= 31 && same(range(a, a + 5));
    }
    case 'trio': return same([0, 1, 2]) || same([0, 2, 3]);
    case 'firstfour': return same([0, 1, 2, 3]);
    case 'dozen': return [1, 2, 3].some((i) => same(outsideNumbers('dozen', i)));
    case 'column': return [1, 2, 3].some((i) => same(outsideNumbers('column', i)));
    default: return same(outsideNumbers(kind));
  }
}

/** Pago "a 1" de una apuesta según cuántos números cubre. */
export function payoutFor(numbersCovered: number): number {
  return 36 / numbersCovered - 1;
}

export function winProbability(numbersCovered: number): number {
  return numbersCovered / 37;
}

/** Valor esperado por ficha apostada (siempre −1/37 en la ruleta europea). */
export function expectedValue(numbersCovered: number): number {
  const p = winProbability(numbersCovered);
  return p * payoutFor(numbersCovered) - (1 - p);
}

export function spin(rng: Rng): number {
  return randomInt(rng, 37);
}

export interface SettledBet extends RouletteBet {
  won: boolean;
  /** Fichas devueltas (apuesta + ganancia) — 0 si pierde. */
  returned: number;
  net: number;
}

export function settleBets(bets: readonly RouletteBet[], result: number): SettledBet[] {
  return bets.map((b) => {
    const won = b.numbers.includes(result);
    const returned = won ? b.amount * (payoutFor(b.numbers.length) + 1) : 0;
    return { ...b, won, returned, net: returned - b.amount };
  });
}

export function betKey(b: Pick<RouletteBet, 'kind' | 'numbers'>): string {
  return `${b.kind}:${[...b.numbers].sort((x, y) => x - y).join('-')}`;
}

/** Todas las apuestas interiores que incluyen el número `n` (para el selector táctil). */
export function insideBetsContaining(n: number): { kind: BetKind; numbers: number[] }[] {
  const out: { kind: BetKind; numbers: number[] }[] = [{ kind: 'straight', numbers: [n] }];
  const cand: { kind: BetKind; numbers: number[] }[] = [];
  for (let a = 0; a <= 36; a++) for (let b = a + 1; b <= 36; b++) if (adjacent(a, b)) cand.push({ kind: 'split', numbers: [a, b] });
  for (let r = 1; r <= 34; r += 3) cand.push({ kind: 'street', numbers: [r, r + 1, r + 2] });
  for (let a = 1; a <= 32; a++) if (columnOf(a) !== 3) cand.push({ kind: 'corner', numbers: [a, a + 1, a + 3, a + 4] });
  for (let r = 1; r <= 31; r += 3) cand.push({ kind: 'sixline', numbers: range(r, r + 5) });
  cand.push({ kind: 'trio', numbers: [0, 1, 2] }, { kind: 'trio', numbers: [0, 2, 3] }, { kind: 'firstfour', numbers: [0, 1, 2, 3] });
  for (const c of cand) if (c.numbers.includes(n)) out.push(c);
  return out;
}

export function describeBet(b: Pick<RouletteBet, 'kind' | 'numbers'>): string {
  const ns = [...b.numbers].sort((x, y) => x - y);
  switch (b.kind) {
    case 'straight': return `Pleno al ${ns[0]}`;
    case 'split': return `Caballo ${ns.join('-')}`;
    case 'street': return `Transversal ${ns[0]}-${ns[2]}`;
    case 'corner': return `Cuadro ${ns.join('-')}`;
    case 'sixline': return `Seisena ${ns[0]}-${ns[5]}`;
    case 'trio': return `Trío ${ns.join('-')}`;
    case 'firstfour': return 'Primeros cuatro 0-1-2-3';
    case 'dozen': return `${ns[0] === 1 ? '1.ª' : ns[0] === 13 ? '2.ª' : '3.ª'} docena (${ns[0]}-${ns[11]})`;
    case 'column': return `Columna ${columnOf(ns[0]!)}`;
    default: return BET_NAMES_ES[b.kind];
  }
}
