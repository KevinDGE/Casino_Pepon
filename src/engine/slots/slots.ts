/**
 * Tragamonedas "Fiesta Pepona": 3 carretes × 3 filas, 5 líneas.
 * Cada carrete se detiene en una posición uniforme de su tira (sin "casi
 * ganas" artificiales): lo que ves es exactamente la tira real.
 * El RTP se calcula EXACTO enumerando todas las combinaciones de paradas.
 */
import { type Rng, randomInt } from '../../core/rng';

export type SlotSymbol = 'pepon' | 'siete' | 'corona' | 'diamante' | 'campana' | 'estrella' | 'cereza';

export const SYMBOL_NAMES_ES: Record<SlotSymbol, string> = {
  pepon: 'Pepón (comodín)', siete: 'Siete', corona: 'Corona', diamante: 'Diamante', campana: 'Campana', estrella: 'Estrella', cereza: 'Cereza',
};

/** Pago por línea (× apuesta por línea) por tres iguales. El comodín sustituye a cualquiera. */
export const THREE_PAYS: Record<SlotSymbol, number> = {
  pepon: 500, siete: 100, corona: 50, diamante: 25, campana: 15, estrella: 8, cereza: 9,
};
/** Dos cerezas desde la izquierda (sin comodín). */
export const CHERRY_PAYS = { two: 3 } as const;

const strip = (counts: Partial<Record<SlotSymbol, number>>, order: SlotSymbol[]): SlotSymbol[] => {
  // Intercala símbolos para que la tira se vea variada y determinista.
  const pool: SlotSymbol[] = [];
  const left = { ...counts } as Record<SlotSymbol, number>;
  let any = true;
  while (any) {
    any = false;
    for (const s of order) {
      if ((left[s] ?? 0) > 0) { pool.push(s); left[s]!--; any = true; }
    }
  }
  return pool;
};

const ORDER: SlotSymbol[] = ['cereza', 'estrella', 'campana', 'diamante', 'estrella', 'corona', 'cereza', 'siete', 'campana', 'pepon'];

export const REELS: SlotSymbol[][] = [
  strip({ pepon: 1, siete: 2, corona: 3, diamante: 4, campana: 6, estrella: 7, cereza: 7 }, ORDER),
  strip({ pepon: 1, siete: 2, corona: 3, diamante: 4, campana: 6, estrella: 8, cereza: 6 }, ORDER),
  strip({ pepon: 1, siete: 2, corona: 3, diamante: 4, campana: 6, estrella: 8, cereza: 6 }, ORDER),
];

/** Líneas: [fila del carrete 1, 2, 3] (0 = arriba). */
export const LINES: [number, number, number][] = [
  [1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0],
];

export const symbolAt = (reel: number, stop: number, row: number): SlotSymbol => {
  const s = REELS[reel]!;
  return s[(stop + row - 1 + s.length) % s.length]!;
};

/** Pago de una línea (× apuesta por línea). */
export function linePay(a: SlotSymbol, b: SlotSymbol, c: SlotSymbol): number {
  const syms = [a, b, c];
  const wilds = syms.filter((s) => s === 'pepon').length;
  if (wilds === 3) return THREE_PAYS.pepon;
  const base = syms.find((s) => s !== 'pepon')!;
  if (syms.every((s) => s === base || s === 'pepon')) return THREE_PAYS[base];
  if (a === 'cereza' && b === 'cereza') return CHERRY_PAYS.two;
  return 0;
}

export interface SpinResult {
  stops: [number, number, number];
  grid: SlotSymbol[][]; // grid[reel][row]
  lineWins: { line: number; pay: number }[];
  /** Devolución total por ficha de apuesta por línea. */
  totalPay: number;
}

export function evaluateStops(stops: [number, number, number], lines = LINES.length): SpinResult {
  const grid = [0, 1, 2].map((r) => [0, 1, 2].map((row) => symbolAt(r, stops[r]!, row)));
  const lineWins: { line: number; pay: number }[] = [];
  let total = 0;
  LINES.slice(0, lines).forEach((ln, i) => {
    const pay = linePay(grid[0]![ln[0]]!, grid[1]![ln[1]]!, grid[2]![ln[2]]!);
    if (pay > 0) { lineWins.push({ line: i, pay }); total += pay; }
  });
  return { stops, grid, lineWins, totalPay: total };
}

export function spinSlots(rng: Rng, lines = LINES.length): SpinResult {
  const stops: [number, number, number] = [randomInt(rng, REELS[0]!.length), randomInt(rng, REELS[1]!.length), randomInt(rng, REELS[2]!.length)];
  return evaluateStops(stops, lines);
}

/** RTP exacto: promedio de pago / apuesta total, sobre todas las paradas posibles. */
export function exactSlotsRTP(lines = LINES.length): { rtp: number; hitRate: number; combos: number } {
  const [a, b, c] = REELS.map((r) => r.length) as [number, number, number];
  let pay = 0, hits = 0;
  for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) for (let k = 0; k < c; k++) {
    const r = evaluateStops([i, j, k], lines);
    pay += r.totalPay;
    if (r.totalPay > 0) hits++;
  }
  const combos = a * b * c;
  return { rtp: pay / (combos * lines), hitRate: hits / combos, combos };
}

/** Probabilidad exacta de tres iguales (con comodines) en una línea. */
export function symbolOdds(): { symbol: SlotSymbol; pay: number; prob: number }[] {
  const freq = REELS.map((r) => {
    const f: Record<string, number> = {};
    for (const s of r) f[s] = (f[s] ?? 0) + 1;
    return { f, n: r.length };
  });
  const p = (reel: number, s: SlotSymbol) => (freq[reel]!.f[s] ?? 0) / freq[reel]!.n;
  return (Object.keys(THREE_PAYS) as SlotSymbol[]).map((s) => {
    const prob = s === 'pepon'
      ? p(0, 'pepon') * p(1, 'pepon') * p(2, 'pepon')
      : (p(0, s) + p(0, 'pepon')) * (p(1, s) + p(1, 'pepon')) * (p(2, s) + p(2, 'pepon')) - p(0, 'pepon') * p(1, 'pepon') * p(2, 'pepon');
    return { symbol: s, pay: THREE_PAYS[s], prob };
  });
}
