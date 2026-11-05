/**
 * Valor esperado (EV) exacto de cada acción de blackjack bajo una composición
 * de zapato dada, con la aproximación de "composición fija" (las
 * probabilidades de cada valor no cambian al sacar cartas adicionales dentro
 * de la misma mano). Con 6–8 mazos el error es despreciable; con 1 mazo es
 * pequeño (ver README).
 *
 * EV expresado en unidades de la apuesta original de la mano
 * (+1 = ganar la apuesta, −1 = perderla).
 */
import type { BlackjackRules } from '../../engine/blackjack/types';
import type { BJAction } from '../../engine/blackjack/types';

/** Índices de la distribución final del crupier. */
export const D17 = 0, D18 = 1, D19 = 2, D20 = 3, D21 = 4, DBUST = 5, DBJ = 6;

export interface EVInput {
  rules: BlackjackRules;
  /** Composición restante, índices 1..10. */
  comp: readonly number[];
  /** Valores de las cartas del jugador (1 = As). */
  player: readonly number[];
  /** Valor de la carta visible del crupier. */
  up: number;
  canDouble: boolean;
  canSplit: boolean;
  /** Manos ya existentes del jugador (para limitar re-divisiones). */
  handsCount: number;
  /** La mano proviene de dividir ases (no se puede pedir si la regla lo prohíbe). */
  splitAces: boolean;
  /** ¿Ya se revisó que el crupier no tiene blackjack? */
  peeked: boolean;
}

export interface ActionEVs {
  stand: number;
  hit: number | null;
  double: number | null;
  split: number | null;
  best: BJAction;
  /** Distribución final del crupier usada en el cálculo. */
  dealer: number[];
  bustIfHit: number;
}

export function probabilities(comp: readonly number[]): number[] {
  let total = 0;
  for (let v = 1; v <= 10; v++) total += comp[v] ?? 0;
  const p = new Array<number>(11).fill(0);
  if (total <= 0) {
    for (let v = 1; v <= 9; v++) p[v] = 1 / 13;
    p[10] = 4 / 13;
    return p;
  }
  for (let v = 1; v <= 10; v++) p[v] = (comp[v] ?? 0) / total;
  return p;
}

/** Distribución final del crupier dada su carta visible. */
export function dealerDistribution(p: readonly number[], up: number, rules: BlackjackRules, peeked: boolean): number[] {
  const memo = new Map<number, Float64Array>();
  const h17 = rules.dealerHitsSoft17;

  const fromState = (hard: number, ace: boolean): Float64Array => {
    const key = hard * 2 + (ace ? 1 : 0);
    const cached = memo.get(key);
    if (cached) return cached;
    const out = new Float64Array(7);
    const soft = ace && hard + 10 <= 21;
    const total = soft ? hard + 10 : hard;
    if (hard > 21) {
      out[DBUST] = 1;
    } else if (total > 17 || (total === 17 && !(soft && h17))) {
      out[total - 17] = 1;
    } else {
      for (let v = 1; v <= 10; v++) {
        const pv = p[v]!;
        if (pv === 0) continue;
        const sub = fromState(hard + v, ace || v === 1);
        for (let i = 0; i < 7; i++) out[i]! += pv * sub[i]!;
      }
    }
    memo.set(key, out);
    return out;
  };

  const result = new Array<number>(7).fill(0);
  // Carta oculta: condicionada si ya se revisó el blackjack.
  let norm = 0;
  for (let v = 1; v <= 10; v++) {
    const bj = (up === 1 && v === 10) || (up === 10 && v === 1);
    if (bj && peeked) continue;
    norm += p[v]!;
  }
  for (let v = 1; v <= 10; v++) {
    const pv = p[v]!;
    if (pv === 0) continue;
    const bj = (up === 1 && v === 10) || (up === 10 && v === 1);
    if (bj && peeked) continue;
    const w = pv / norm;
    if (bj) {
      result[DBJ]! += w;
      continue;
    }
    const sub = fromState(up + v, up === 1 || v === 1);
    for (let i = 0; i < 7; i++) result[i]! += w * sub[i]!;
  }
  return result;
}

function total(hard: number, ace: boolean): number {
  return ace && hard + 10 <= 21 ? hard + 10 : hard;
}

/** EV de plantarse con un total (no natural) contra la distribución del crupier. */
export function standEV(t: number, d: readonly number[]): number {
  if (t > 21) return -1;
  let ev = d[DBUST]! - d[DBJ]!;
  for (let i = 0; i < 5; i++) {
    const dt = 17 + i;
    if (t > dt) ev += d[i]!;
    else if (t < dt) ev -= d[i]!;
  }
  return ev;
}

class Solver {
  private hitMemo = new Map<number, number>();
  constructor(private p: readonly number[], private d: readonly number[]) {}

  stand(hard: number, ace: boolean): number {
    return standEV(total(hard, ace), this.d);
  }

  /** Mejor EV sin poder doblar ni dividir (tras pedir). */
  best(hard: number, ace: boolean): number {
    if (hard > 21) return -1;
    return Math.max(this.stand(hard, ace), this.hit(hard, ace));
  }

  hit(hard: number, ace: boolean): number {
    if (hard > 21) return -1;
    const key = hard * 2 + (ace ? 1 : 0);
    const c = this.hitMemo.get(key);
    if (c !== undefined) return c;
    let ev = 0;
    for (let v = 1; v <= 10; v++) {
      const pv = this.p[v]!;
      if (pv === 0) continue;
      const nh = hard + v;
      ev += pv * (nh > 21 ? -1 : this.best(nh, ace || v === 1));
    }
    this.hitMemo.set(key, ev);
    return ev;
  }

  double(hard: number, ace: boolean): number {
    let ev = 0;
    for (let v = 1; v <= 10; v++) {
      const pv = this.p[v]!;
      if (pv === 0) continue;
      const nh = hard + v;
      ev += pv * (nh > 21 ? -1 : this.stand(nh, ace || v === 1));
    }
    return 2 * ev;
  }

  bustProbIfHit(hard: number): number {
    let b = 0;
    for (let v = 1; v <= 10; v++) if (hard + v > 21) b += this.p[v]!;
    return b;
  }
}

function doubleAllowedFor(rules: BlackjackRules, hard: number, ace: boolean): boolean {
  const t = total(hard, ace);
  const soft = ace && hard + 10 <= 21;
  if (rules.doubleOn === '9-11') return !soft && t >= 9 && t <= 11;
  if (rules.doubleOn === '10-11') return !soft && t >= 10 && t <= 11;
  return true;
}

/** EV de dividir un par de valor `v` (re-división aproximada por punto fijo). */
function splitEV(solver: Solver, p: readonly number[], v: number, rules: BlackjackRules, handsCount: number): number {
  const aces = v === 1;
  const canResplit = handsCount + 1 < rules.maxHands && (!aces || rules.resplitAces);
  let A = 0;
  let B = 0;
  for (let w = 1; w <= 10; w++) {
    const pw = p[w]!;
    if (pw === 0) continue;
    const hard = v + w;
    const ace = aces || w === 1;
    let val: number;
    if (aces && !rules.hitSplitAces) {
      val = solver.stand(hard, ace);
    } else {
      val = solver.best(hard, ace);
      if (rules.doubleAfterSplit && doubleAllowedFor(rules, hard, ace)) val = Math.max(val, solver.double(hard, ace));
    }
    if (w === v) B = val;
    else A += pw * val;
  }
  const pv = p[v]!;
  if (!canResplit || pv === 0) return 2 * (A + pv * B);
  const withResplit = A / (1 - 2 * pv);
  const ev1 = 2 * withResplit > B ? withResplit : A + pv * B;
  return 2 * ev1;
}

export function computeEVs(input: EVInput): ActionEVs {
  const p = probabilities(input.comp);
  const d = dealerDistribution(p, input.up, input.rules, input.peeked);
  const solver = new Solver(p, d);
  let hard = 0;
  let ace = false;
  for (const v of input.player) {
    hard += v;
    if (v === 1) ace = true;
  }
  const stand = solver.stand(hard, ace);
  const lockedAces = input.splitAces && !input.rules.hitSplitAces;
  const hit = lockedAces ? null : solver.hit(hard, ace);
  const dbl = input.canDouble ? solver.double(hard, ace) : null;
  const split =
    input.canSplit && input.player.length === 2 && input.player[0] === input.player[1]
      ? splitEV(solver, p, input.player[0]!, input.rules, input.handsCount)
      : null;
  let best: BJAction = 'stand';
  let bestEV = stand;
  if (hit !== null && hit > bestEV) { best = 'hit'; bestEV = hit; }
  if (dbl !== null && dbl > bestEV) { best = 'double'; bestEV = dbl; }
  if (split !== null && split > bestEV) { best = 'split'; bestEV = split; }
  return { stand, hit, double: dbl, split, best, dealer: d, bustIfHit: solver.bustProbIfHit(hard) };
}

/** EV del seguro por unidad de apuesta principal (asegurando la mitad). */
export function insuranceEV(comp: readonly number[]): { ev: number; tenProb: number } {
  const p = probabilities(comp);
  const q = p[10]!;
  return { ev: 0.5 * (3 * q - 1), tenProb: q };
}

/** Composición de un zapato completo de `decks` mazos. */
export function fullComposition(decks: number): number[] {
  const comp = new Array<number>(11).fill(0);
  for (let v = 1; v <= 9; v++) comp[v] = 4 * decks;
  comp[10] = 16 * decks;
  return comp;
}
