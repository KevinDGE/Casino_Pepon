/**
 * Análisis de una decisión de póker a partir de una PokerView (información pública
 * + cartas propias). Lo usan la IA Experta y el coach.
 *
 * Pasos:
 *  1. Estimar el rango de cada rival a partir de sus acciones públicas y su estilo observado.
 *  2. Calcular equity con Monte Carlo contra esos rangos.
 *  3. Estimar el EV (en fichas) de cada opción legal: retirarse, pasar, igualar,
 *     apostar/subir con varios tamaños y all-in, usando fold equity, pot odds,
 *     implied odds, posición (realización de equity), SPR y textura.
 */
import type { Rng } from '../../core/rng';
import type { PokerAction, Street } from '../../engine/poker/types';
import type { PokerView, PublicPlayer } from '../../engine/poker/view';
import { describeScore, evaluateHoleBoard } from '../../engine/poker/handEval';
import { COMBO_CLASS, NUM_COMBOS, comboOf } from './combos';
import { equityVsRanges, type EquityResult, type OppInput } from './equity';
import {
  CLASS_PERCENTILE, boardStrength, boardTexture, drawOuts, fullRange, preflopPercentile, removeDead,
  rangeWidth, topRange, topWeight, type Range, type Texture,
} from './ranges';
import { tendencies, type ModelStore, type Tendencies } from './opponentModel';

export interface StyleParams {
  /** Multiplicador de rango de apertura preflop. */
  looseness: number;
  /** Bono relativo al EV de opciones agresivas. */
  aggression: number;
  /** Multiplicador del objetivo de faroles. */
  bluff: number;
  /** Multiplicador de la temperatura (aleatoriedad) al elegir. */
  temperature: number;
}

export const NEUTRAL_STYLE: StyleParams = { looseness: 1, aggression: 0, bluff: 1, temperature: 1 };

export type OptionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface OptionEV {
  kind: OptionKind;
  action: PokerAction;
  /** Total de la apuesta en la calle (para bet/raise/allin). */
  to: number;
  /** Fichas que se agregan con esta acción. */
  added: number;
  /** Fracción del bote (para apuestas). */
  sizeFrac: number;
  ev: number;
  foldProb: number;
  eqWhenCalled: number;
  isBluff: boolean;
}

export interface OppEstimate {
  seat: number;
  name: string;
  width: number;
  tendencies: Tendencies;
  styleLabel: string;
}

export interface Analysis {
  street: Street;
  equity: number;
  potOdds: number;
  toCall: number;
  pot: number;
  effStack: number;
  spr: number;
  inPosition: boolean;
  handDesc: string;
  madePercentile: number;
  outs: number;
  texture: Texture;
  impliedBonus: number;
  options: OptionEV[];
  best: OptionEV;
  opponents: OppEstimate[];
  preflopPct: number;
  /** Decisión preflop por tabla de apertura (sin EV detallado). */
  openChart: boolean;
  /** Porcentaje de manos con que conviene abrir desde esta posición (si openChart). */
  openPct: number;
}

export interface AnalyzeOptions {
  iterations: number;
  rng: Rng;
  models: ModelStore;
  style?: StyleParams;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Fuerza 0..1 (1 = mejor) de cada combo en una calle. */
function streetStrength(board: readonly number[]): Float64Array {
  if (board.length < 3) {
    const s = new Float64Array(NUM_COMBOS);
    for (let i = 0; i < NUM_COMBOS; i++) s[i] = 1 - CLASS_PERCENTILE[COMBO_CLASS[i]!]!;
    return s;
  }
  return boardStrength(board).hs;
}

/** Percentil dentro del rango (0 = más fuerte) según una fuerza. */
export function percentileWithin(range: Range, strength: Float64Array): Float64Array {
  const idx: number[] = [];
  for (let i = 0; i < NUM_COMBOS; i++) if (range[i]! > 0) idx.push(i);
  idx.sort((a, b) => strength[b]! - strength[a]!);
  let total = 0;
  for (const i of idx) total += range[i]!;
  const pct = new Float64Array(NUM_COMBOS).fill(1);
  let acc = 0;
  let j = 0;
  while (j < idx.length) {
    // Agrupar empates
    let k = j;
    let w = 0;
    while (k < idx.length && strength[idx[k]!] === strength[idx[j]!]) { w += range[idx[k]!]!; k++; }
    const p = total > 0 ? (acc + w / 2) / total : 0.5;
    for (let m = j; m < k; m++) pct[idx[m]!] = p;
    acc += w;
    j = k;
  }
  return pct;
}

function isAggressive(kind: string, to: number, prevMax: number): boolean {
  return kind === 'bet' || kind === 'raise' || (kind === 'allin' && to > prevMax);
}

/** Etiqueta del estilo observado. */
export function styleLabel(t: Tendencies): string {
  if (t.hands < 8) return 'Aún sin datos suficientes';
  const loose = t.vpip > 0.38;
  const tight = t.vpip < 0.22;
  const aggr = t.aggFreq > 0.42 || t.pfr / Math.max(0.01, t.vpip) > 0.65;
  const passive = t.aggFreq < 0.25;
  if (loose && aggr) return 'Suelto y agresivo';
  if (loose && passive) return 'Suelto y pasivo (paga mucho)';
  if (tight && aggr) return 'Cerrado y agresivo';
  if (tight) return 'Cerrado (juega pocas manos)';
  if (aggr) return 'Agresivo';
  if (passive) return 'Pasivo';
  return 'Equilibrado';
}

/**
 * Rango estimado de un rival, reconstruido con sus acciones públicas de la mano.
 */
export function estimateRange(view: PokerView, opp: PublicPlayer, t: Tendencies): Range {
  const dead = [...view.hole, ...view.board];
  const r = topRange(clamp(t.vpip * 1.05, 0.12, 0.95));
  const pos = opp.position;
  const lateOpen = pos === 'BTN' || pos === 'CO' || pos === 'SB';
  let raises = 0;
  let prevMax = view.bigBlind;
  const strengthByStreet = new Map<Street, Float64Array>();
  const boardAt = (s: Street) => view.board.slice(0, s === 'flop' ? 3 : s === 'turn' ? 4 : 5);
  let actedPre = false;
  for (const a of view.actions) {
    if (a.street !== 'preflop') break;
    const agg = isAggressive(a.kind, a.to, prevMax);
    if (a.seat === opp.seat) {
      actedPre = true;
      const pctOf = (i: number) => CLASS_PERCENTILE[COMBO_CLASS[i]!]!;
      if (agg) {
        let width: number;
        if (raises === 0) width = clamp(t.pfr * (lateOpen ? 1.45 : 1.0), 0.04, 0.9);
        else if (raises === 1) width = clamp(t.threeBet * 1.2 + 0.015, 0.025, 0.35);
        else width = clamp(t.threeBet * 0.45, 0.015, 0.12);
        // All-in corto: rango más amplio.
        if (a.kind === 'allin' && a.to < view.bigBlind * 18) width = Math.max(width, 0.3);
        for (let i = 0; i < NUM_COMBOS; i++) r[i]! *= topWeight(pctOf(i), width, 0.04);
      } else if (a.kind === 'call' || a.kind === 'allin') {
        let width: number;
        let cap: number;
        if (raises === 0) { width = t.vpip; cap = t.pfr * 0.9; }
        else if (raises === 1) { width = clamp(t.vpip * 0.7, 0.08, 0.7); cap = clamp(t.threeBet, 0.02, 0.2); }
        else { width = clamp(t.threeBet * 1.8, 0.04, 0.25); cap = 0.02; }
        for (let i = 0; i < NUM_COMBOS; i++) {
          const p = pctOf(i);
          r[i]! *= topWeight(p, width, 0.05) * (1 - 0.55 * topWeight(p, cap, 0.02));
        }
      } else if (a.kind === 'check') {
        // La BB que sólo pasa no suele tener manos premium.
        for (let i = 0; i < NUM_COMBOS; i++) r[i]! = (1 - 0.7 * topWeight(pctOf(i), t.pfr * 0.7, 0.03));
      }
    }
    if (agg) { raises++; prevMax = a.to; }
  }
  if (!actedPre && opp.seat === view.bbSeat) {
    // BB sin hablar todavía: defiende un rango amplio.
    const wide = topRange(clamp(t.vpip * 1.6, 0.3, 1));
    for (let i = 0; i < NUM_COMBOS; i++) r[i] = wide[i]!;
  }
  removeDead(r, dead);
  // Calles posteriores.
  for (const street of ['flop', 'turn', 'river'] as Street[]) {
    const acts = view.actions.filter((a) => a.street === street);
    if (acts.length === 0) continue;
    const b = boardAt(street);
    if (b.length < 3) break;
    let st = strengthByStreet.get(street);
    if (!st) { st = streetStrength(b); strengthByStreet.set(street, st); }
    const bs = boardStrength(b);
    let maxTo = 0;
    let oppWasAgg = false;
    for (const a of acts) {
      const agg = isAggressive(a.kind, a.to, maxTo);
      if (a.seat === opp.seat && a.kind !== 'fold') {
        const q = percentileWithin(r, st);
        const facing = maxTo > 0;
        let k: number;
        if (!facing) k = clamp(t.aggFreq * 1.05, 0.08, 0.75);
        else if (!oppWasAgg) k = clamp(t.raiseVsBet * 1.1, 0.04, 0.5);
        else k = clamp(t.reraisePost, 0.03, 0.4);
        const cont = clamp(1 - (oppWasAgg ? t.foldToReraisePost : t.foldToBet) * 0.95, 0.15, 0.97);
        const bluffFloor = (0.03 + 0.22 * t.bluffRate) * (facing ? 0.6 : 1);
        for (let i = 0; i < NUM_COMBOS; i++) {
          if (r[i]! <= 0) continue;
          const qi = q[i]!;
          const outs = bs.outs[i]!;
          const drawBonus = street === 'river' ? 0 : outs >= 8 ? 0.4 : outs >= 4 ? 0.15 : 0;
          let L: number;
          if (agg) {
            L = Math.max(sigmoid((k - qi) / 0.06), bluffFloor + drawBonus * (facing ? 0.6 : 1));
          } else if (a.kind === 'call' || a.kind === 'allin') {
            L = sigmoid((cont - qi) / 0.08) * (1 - 0.35 * sigmoid((t.aggFreq * 0.35 - qi) / 0.03));
            L = Math.max(L, drawBonus * 1.5, 0.02);
          } else {
            // check
            L = 1 - 0.6 * sigmoid((t.aggFreq * 0.7 - qi) / 0.05);
          }
          r[i]! *= L;
        }
        if (agg) oppWasAgg = true;
      }
      if (agg) maxTo = a.to;
    }
  }
  return r;
}

function inPositionPostflop(view: PokerView): boolean {
  const n = view.players.length;
  const dist = (s: number) => (s - view.button - 1 + n) % n;
  let maxD = -1;
  let who = -1;
  for (const p of view.players) {
    if (p.out || p.folded) continue;
    if (dist(p.seat) > maxD) { maxD = dist(p.seat); who = p.seat; }
  }
  return who === view.seat;
}

/** Porcentaje base de apertura preflop según jugadores por hablar detrás. */
function baseOpenPct(behind: number, headsUp: boolean): number {
  if (headsUp) return 0.8;
  switch (behind) {
    case 1: return 0.5; // SB vs BB
    case 2: return 0.48; // BTN
    case 3: return 0.3; // CO
    case 4: return 0.21;
    default: return 0.16;
  }
}

export function analyze(view: PokerView, opts: AnalyzeOptions): Analysis {
  const style = opts.style ?? NEUTRAL_STYLE;
  const me = view.players[view.seat]!;
  const legal = view.legal;
  const bb = view.bigBlind;
  const pot = view.pot;
  const toCall = legal.toCall;
  const callAmt = legal.callAmount;
  const opps = view.players.filter((p) => p.seat !== view.seat && !p.out && !p.folded);
  const headsUp = view.players.filter((p) => !p.out).length === 2;
  const tends = new Map<number, Tendencies>();
  for (const o of opps) tends.set(o.seat, tendencies(opts.models[o.id]));

  // Rangos y percentiles.
  const strengthNow = streetStrength(view.board);
  const oppInputs: OppInput[] = [];
  const ranges: Range[] = [];
  for (const o of opps) {
    const r = estimateRange(view, o, tends.get(o.seat)!);
    ranges.push(r);
    oppInputs.push({ range: r, pct: percentileWithin(r, strengthNow), responder: !o.allIn });
  }
  const iters = opts.iterations;
  const mc: EquityResult = opps.length
    ? equityVsRanges(view.hole, view.board, oppInputs, iters, opts.rng)
    : { equity: 1, samples: 0, eqTop: () => 1 };
  const equity = mc.equity;

  const maxOppStack = Math.max(0, ...opps.map((o) => o.stack + o.bet));
  const myTotal = me.stack + me.bet;
  const effStack = Math.min(myTotal, maxOppStack);
  const spr = pot > 0 ? (effStack - me.bet) / pot : 99;
  const ip = view.street === 'preflop' ? me.position === 'BTN' || (headsUp && me.seat === view.button) : inPositionPostflop(view);
  const river = view.street === 'river';
  const texture = boardTexture(view.board);

  let madePct = 0;
  let outs = 0;
  let handDesc: string;
  if (view.board.length >= 3) {
    const bs = boardStrength(view.board);
    const ci = comboOf(view.hole[0]!, view.hole[1]!);
    madePct = bs.made[ci]!;
    const score = evaluateHoleBoard(view.hole[0]!, view.hole[1]!, view.board);
    outs = drawOuts(view.hole[0]!, view.hole[1]!, view.board, score);
    handDesc = describeScore(score);
  } else {
    const r0 = view.hole[0]! >> 2, r1 = view.hole[1]! >> 2;
    handDesc = r0 === r1 ? 'Pareja de mano' : (view.hole[0]! & 3) === (view.hole[1]! & 3) ? 'Cartas del mismo palo' : 'Cartas de distinto palo';
  }
  const preflopPct = preflopPercentile(view.hole[0]!, view.hole[1]!);

  // Realización de equity según posición y calle.
  const realization = (allIn: boolean, aggressor: boolean) => {
    if (allIn || river) return 1;
    if (view.street === 'preflop') return ip ? (aggressor ? 0.95 : 0.9) : aggressor ? 0.88 : 0.8;
    return ip ? (aggressor ? 0.98 : 0.95) : aggressor ? 0.93 : 0.88;
  };

  // Implied odds para proyectos y parejas pequeñas.
  const effAfterCall = Math.max(0, effStack - me.bet - callAmt);
  let impliedBonus = 0;
  if (!river && callAmt > 0 && effAfterCall > 0) {
    if (view.street === 'preflop') {
      const r0 = view.hole[0]! >> 2, r1 = view.hole[1]! >> 2;
      const suitedConn = (view.hole[0]! & 3) === (view.hole[1]! & 3) && Math.abs(r0 - r1) <= 2;
      if (r0 === r1 && r0 < 9) impliedBonus = 0.118 * Math.min(effAfterCall, 18 * callAmt) * 0.45;
      else if (suitedConn) impliedBonus = 0.06 * Math.min(effAfterCall, 12 * callAmt) * 0.35;
    } else if (outs >= 4 && madePct < 0.75) {
      const hit = outs / (view.board.length === 3 ? 47 : 46);
      impliedBonus = hit * Math.min(effAfterCall, 0.75 * (pot + callAmt)) * 0.45;
    }
  }

  const options: OptionEV[] = [];
  const mk = (kind: OptionKind, action: PokerAction, to: number, added: number, ev: number, extra: Partial<OptionEV> = {}): OptionEV => ({
    kind, action, to, added, sizeFrac: pot > 0 ? added / pot : 0, ev, foldProb: 0, eqWhenCalled: equity, isBluff: false, ...extra,
  });
  if (legal.canFold) options.push(mk('fold', { type: 'fold' }, 0, 0, 0));
  if (legal.canCheck) {
    options.push(mk('check', { type: 'check' }, me.bet, 0, realization(false, false) * equity * pot));
  }
  if (legal.canCall) {
    const allInCall = callAmt >= me.stack || opps.every((o) => o.allIn || o.stack === 0);
    const R = realization(allInCall, false);
    const ev = R * equity * (pot + callAmt) - callAmt + (allInCall ? 0 : impliedBonus);
    options.push(mk(allInCall && callAmt >= me.stack ? 'allin' : 'call', { type: 'call' }, me.bet + callAmt, callAmt, ev));
  }

  // Candidatos de apuesta / subida.
  const raiseTos = new Set<number>();
  if (legal.canRaise) {
    const add = (to: number) => raiseTos.add(Math.round(clamp(to, legal.minRaiseTo, legal.maxRaiseTo)));
    if (view.street === 'preflop') {
      const raisesSoFar = view.actions.filter((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'bet' || (a.kind === 'allin' && a.to > bb))).length;
      const limpers = view.actions.filter((a) => a.street === 'preflop' && a.kind === 'call' && raisesSoFar === 0).length;
      if (raisesSoFar === 0) {
        for (const x of headsUp ? [2.2, 2.5, 3] : [2.3, 2.6, 3]) add((x + limpers) * bb);
      } else {
        const m = ip ? 3 : 3.8;
        add(view.currentBet * m * 0.85);
        add(view.currentBet * m);
        if (raisesSoFar >= 2) add(view.currentBet * 2.3);
      }
    } else {
      const fracs = view.currentBet === 0
        ? river ? [0.5, 0.75, 1.25] : texture.wetness >= 0.45 ? [0.5, 0.75, 1] : [0.33, 0.5, 0.75]
        : [0.65, 1];
      for (const f of fracs) {
        if (view.currentBet === 0) add(f * pot);
        else add(view.currentBet + f * (pot + toCall));
      }
    }
    // All-in sólo cuando es un tamaño razonable (stack corto, SPR bajo o guerra de re-subidas).
    const potRaiseTo = view.currentBet + (pot + toCall);
    const preRaises = view.actions.filter((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'bet' || a.kind === 'allin')).length;
    const shoveOk = view.street === 'preflop'
      ? legal.maxRaiseTo <= 25 * bb || preRaises >= 2 || legal.maxRaiseTo <= view.currentBet * 4
      : spr <= 4 || legal.maxRaiseTo <= potRaiseTo * 1.6;
    if (shoveOk) add(legal.maxRaiseTo);
    if (raiseTos.size === 0) add(legal.minRaiseTo);
  }

  const responders = opps.filter((o) => !o.allIn && o.stack > 0);
  // Equity contra el rango que continúa (simulación condicionada, cacheada por umbral).
  const contCache = new Map<number, number>();
  const eqVsContinuing = (c: number): number => {
    if (c >= 0.7) return mc.eqTop(c);
    const key = Math.max(0.04, Math.round(c * 20) / 20);
    const hit = contCache.get(key);
    if (hit !== undefined) return hit;
    const truncated: OppInput[] = oppInputs.map((oi) => {
      if (!oi.responder) return oi;
      const r = new Float64Array(NUM_COMBOS);
      for (let i = 0; i < NUM_COMBOS; i++) r[i] = oi.range[i]! * topWeight(oi.pct[i]!, key, 0.03);
      return { range: r, pct: oi.pct, responder: true };
    });
    const eq = equityVsRanges(view.hole, view.board, truncated, Math.max(150, Math.round(iters * 0.5)), opts.rng).equity;
    contCache.set(key, eq);
    return eq;
  };
  const prevAgg = view.actions.filter((a) => a.street === view.street && (a.kind === 'raise' || a.kind === 'bet' || a.kind === 'allin')).length;
  for (const to of raiseTos) {
    const added = to - me.bet;
    if (added <= 0) continue;
    const isAllIn = to >= legal.maxRaiseTo;
    let pFoldAll = 1;
    let expCall = 0;
    let maxCont = 0;
    let reraiseProb = 0;
    const foldBase = added / (pot + added);
    for (const o of responders) {
      const t = tends.get(o.seat)!;
      const callA = Math.min(to - o.bet, o.stack);
      let fold: number;
      let rho: number;
      const oppAgg = view.actions.some((a) => a.street === view.street && a.seat === o.seat && (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin'));
      if (view.street === 'preflop') {
        const sizeAdj = clamp(Math.sqrt(foldBase / 0.6), 0.6, 1.4);
        if (oppAgg) {
          fold = t.foldToReraisePre * sizeAdj;
          rho = t.reraisePre;
        } else {
          const bbDef = o.seat === view.bbSeat && prevAgg === 0 ? 0.8 : 1;
          fold = t.foldToRaisePre * sizeAdj * bbDef;
          rho = clamp(t.threeBet / Math.max(0.1, 1 - t.foldToRaisePre), 0.03, 0.5);
        }
        fold = clamp(fold, 0.02, 0.95);
      } else if (oppAgg) {
        fold = clamp(t.foldToReraisePost * clamp(Math.sqrt(foldBase / 0.5), 0.6, 1.4), 0.02, 0.9);
        rho = t.reraisePost;
      } else {
        fold = clamp(t.foldToBet * Math.pow(foldBase / 0.4, 0.6) * (river ? 1.05 : 0.95), 0.03, 0.85);
        rho = clamp(t.raiseVsBet / Math.max(0.1, 1 - t.foldToBet), 0.03, 0.5);
      }
      if (to >= legal.maxRaiseTo || o.stack <= to - o.bet) rho = 0;
      reraiseProb = Math.max(reraiseProb, clamp(rho, 0, 0.6));
      // Rivales cortos pagan más al quedar comprometidos.
      if (o.stack + o.bet <= to * 1.15) fold *= 0.75;
      pFoldAll *= fold;
      expCall += (1 - fold) * callA;
      maxCont = Math.max(maxCont, 1 - fold);
    }
    const anyAllInOpp = opps.some((o) => o.allIn);
    const pCalled = 1 - pFoldAll;
    const eqC = responders.length ? eqVsContinuing(maxCont) : equity;
    const K = pCalled > 1e-9 ? expCall / pCalled : 0;
    const R = realization(isAllIn, true);
    const winNow = anyAllInOpp ? equity * pot : pot;
    // Rama "me pagan" y rama "me vuelven a subir" (con manos débiles se abandona lo invertido).
    const callBranch = R * eqC * (pot + added + K) - added;
    const reraiseBranch = clamp(added * (2 * eqC - 1), -added, 0.5 * added);
    let ev = pFoldAll * winNow + pCalled * ((1 - reraiseProb) * callBranch + reraiseProb * reraiseBranch);
    // Incertidumbre del modelo: penaliza arriesgar mucho para ganar poco.
    ev -= pCalled * added * 0.04;
    ev += style.aggression * 0.04 * pot;
    const kind: OptionKind = isAllIn ? 'allin' : view.currentBet === 0 ? 'bet' : 'raise';
    options.push(mk(kind, { type: 'raise', to }, to, added, ev, { foldProb: pFoldAll, eqWhenCalled: eqC, isBluff: eqC < 0.42 && !isAllIn }));
  }

  // Preflop primera entrada: tabla de apertura (más estable que el EV aproximado).
  let openChart = false;
  let openPctOut = 0;
  if (view.street === 'preflop') {
    const raisesSoFar = view.actions.filter((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'bet' || (a.kind === 'allin' && a.to > bb))).length;
    const effBB = effStack / bb;
    if (raisesSoFar === 0 && effBB > 14) {
      openChart = true;
      const order: number[] = [];
      const n = view.players.length;
      for (let k = 1; k < n; k++) {
        const s = (view.seat + k) % n;
        const p = view.players[s]!;
        if (!p.out && !p.folded && !view.actions.some((a) => a.seat === s && a.street === 'preflop')) order.push(s);
      }
      const behind = order.length;
      let avgVpip = 0;
      for (const s of order) avgVpip += tends.get(s)?.vpip ?? 0.3;
      avgVpip = behind ? avgVpip / behind : 0.3;
      const adj = clamp(Math.pow(0.3 / avgVpip, 0.5), 0.75, 1.35);
      const limpers = view.actions.filter((a) => a.street === 'preflop' && a.kind === 'call').length;
      const openPct = clamp(baseOpenPct(behind, headsUp) * adj * style.looseness * (limpers ? 0.65 : 1), 0.05, 0.95);
      const inRange = preflopPct <= openPct;
      openPctOut = openPct;
      // Ajustar EVs para que la elección refleje la tabla.
      for (const o of options) {
        if (o.kind === 'raise' || o.kind === 'bet') o.ev = inRange ? bb * (0.3 + (openPct - preflopPct) * 6) : -bb * (0.3 + (preflopPct - openPct) * 3);
        else if (o.kind === 'allin') o.ev = preflopPct < 0.015 && effBB < 30 ? bb * 3 : -bb * 2;
        else if (o.kind === 'call') o.ev = me.seat === view.sbSeat && preflopPct <= openPct * 1.15 && !inRange ? 0.1 * bb : -0.3 * bb;
        else if (o.kind === 'check') o.ev = inRange && preflopPct < openPct * 0.5 ? 0 : 0.5 * bb;
        else if (o.kind === 'fold') o.ev = 0;
      }
    }
  }

  // Mejor opción.
  let best = options[0]!;
  for (const o of options) if (o.ev > best.ev) best = o;
  return {
    street: view.street,
    equity,
    potOdds: toCall > 0 ? callAmt / (pot + callAmt) : 0,
    toCall,
    pot,
    effStack,
    spr,
    inPosition: ip,
    handDesc,
    madePercentile: madePct,
    outs,
    texture,
    impliedBonus,
    options,
    best,
    opponents: opps.map((o, i) => ({
      seat: o.seat,
      name: o.name,
      width: rangeWidth(ranges[i]!),
      tendencies: tends.get(o.seat)!,
      styleLabel: styleLabel(tends.get(o.seat)!),
    })),
    preflopPct,
    openChart,
    openPct: openPctOut,
  };
}

export { fullRange };
