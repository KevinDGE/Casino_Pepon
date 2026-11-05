/**
 * Decisiones de los rivales de póker por nivel.
 * TODOS reciben únicamente una PokerView (sin mazo ni cartas ocultas).
 */
import { type Rng, randomFloat, randomInt } from '../../core/rng';
import type { PokerAction } from '../../engine/poker/types';
import type { PokerView } from '../../engine/poker/view';
import { evaluateHoleBoard, categoryOf } from '../../engine/poker/handEval';
import { analyze, NEUTRAL_STYLE, type OptionEV, type StyleParams } from './analysis';
import { equityVsRandom } from './equity';
import { boardStrength, drawOuts, preflopPercentile } from './ranges';
import { comboOf } from './combos';
import type { ModelStore } from './opponentModel';

export type PokerLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export const LEVEL_NAMES_ES: Record<PokerLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  expert: 'Experto',
};

/** Memoria propia de un bot (frecuencias de farol por calle). */
export interface BotMemory {
  value: Record<string, number>;
  bluff: Record<string, number>;
}

export const newMemory = (): BotMemory => ({ value: {}, bluff: {} });

export interface DecideInput {
  view: PokerView;
  level: PokerLevel;
  style?: StyleParams;
  models: ModelStore;
  memory: BotMemory;
  rng: Rng;
  /** Simulaciones Monte Carlo (Experto/Avanzado). */
  iterations?: number;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function raiseTo(view: PokerView, to: number): PokerAction {
  const l = view.legal;
  if (!l.canRaise) return l.canCall ? { type: 'call' } : { type: 'check' };
  return { type: 'raise', to: Math.round(clamp(to, l.minRaiseTo, l.maxRaiseTo)) };
}

function passive(view: PokerView): PokerAction {
  return view.legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

function callOrCheck(view: PokerView): PokerAction {
  return view.legal.canCheck ? { type: 'check' } : { type: 'call' };
}

/** Normaliza una acción para que siempre sea legal. */
export function sanitize(view: PokerView, a: PokerAction): PokerAction {
  const l = view.legal;
  switch (a.type) {
    case 'fold': return l.canFold ? a : { type: 'check' };
    case 'check': return l.canCheck ? a : l.canFold ? { type: 'fold' } : { type: 'call' };
    case 'call': return l.canCall ? a : { type: 'check' };
    case 'raise': return raiseTo(view, a.to);
  }
}

export function decide(input: DecideInput): PokerAction {
  const a = (() => {
    switch (input.level) {
      case 'beginner': return beginner(input);
      case 'intermediate': return intermediate(input);
      case 'advanced': return advanced(input);
      case 'expert': return expert(input);
    }
  })();
  return sanitize(input.view, a);
}

// ───────────────────────── Experto ─────────────────────────

/** Objetivo de faroles por tamaño de apuesta (fracción del bote) y calle. */
export function bluffTarget(sizeFrac: number, street: string): number {
  const base = sizeFrac / (1 + 2 * sizeFrac);
  const mult = street === 'river' ? 1 : street === 'turn' ? 1.3 : 1.6;
  return clamp(base * mult, 0.1, 0.55);
}

/** Elige entre opciones con softmax sobre el EV (mezcla estratégica). */
export function chooseOption(options: OptionEV[], temperature: number, rng: Rng): OptionEV {
  let maxEV = -Infinity;
  for (const o of options) maxEV = Math.max(maxEV, o.ev);
  const T = Math.max(1e-6, temperature);
  const w = options.map((o) => Math.exp((o.ev - maxEV) / T));
  let tot = 0;
  for (const x of w) tot += x;
  let r = randomFloat(rng) * tot;
  for (let i = 0; i < options.length; i++) {
    r -= w[i]!;
    if (r <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

function expert(input: DecideInput): PokerAction {
  const { view, rng, memory } = input;
  const style = input.style ?? NEUTRAL_STYLE;
  const an = analyze(view, { iterations: input.iterations ?? 1200, rng, models: input.models, style });
  const T = (0.035 * (an.pot + an.toCall) + 0.05 * view.bigBlind) * style.temperature;
  let choice = chooseOption(an.options, T, rng);
  // Control de frecuencia de faroles (postflop).
  if (choice.isBluff && view.street !== 'preflop') {
    const st = view.street;
    const v = memory.value[st] ?? 0;
    const b = memory.bluff[st] ?? 0;
    const target = bluffTarget(choice.sizeFrac, st) * style.bluff;
    const ratio = (b + 1) / (v + b + 3);
    if (ratio > target + 0.06) {
      const nonAgg = an.options.filter((o) => o.kind === 'check' || o.kind === 'call' || o.kind === 'fold');
      if (nonAgg.length) choice = nonAgg.reduce((x, y) => (y.ev > x.ev ? y : x));
    }
  }
  if ((choice.kind === 'bet' || choice.kind === 'raise') && view.street !== 'preflop') {
    if (choice.isBluff) memory.bluff[view.street] = (memory.bluff[view.street] ?? 0) + 1;
    else memory.value[view.street] = (memory.value[view.street] ?? 0) + 1;
  }
  return choice.action;
}

// ───────────────────────── Avanzado ─────────────────────────
// Equity contra manos aleatorias + pot odds + posición. Tamaños fijos, sin modelar rivales.

function advanced(input: DecideInput): PokerAction {
  const { view, rng } = input;
  const l = view.legal;
  const bb = view.bigBlind;
  const opps = view.players.filter((p) => p.seat !== view.seat && !p.out && !p.folded).length;
  const pct = preflopPercentile(view.hole[0]!, view.hole[1]!);
  const raisesPre = view.actions.filter((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'bet' || (a.kind === 'allin' && a.to > bb))).length;
  const pos = view.players[view.seat]!.position;
  const late = pos === 'BTN' || pos === 'CO' || pos === 'SB';
  if (view.street === 'preflop') {
    const headsUp = view.players.filter((p) => !p.out).length === 2;
    const open = headsUp ? 0.6 : late ? 0.32 : 0.18;
    if (raisesPre === 0) {
      if (pct <= open) return raiseTo(view, 2.5 * bb + (view.pot - 1.5 * bb));
      return passive(view);
    }
    if (raisesPre === 1) {
      if (pct <= 0.05) return raiseTo(view, view.currentBet * 3);
      if (pct <= (late ? 0.22 : 0.15)) return callOrCheck(view);
      const potOdds = l.callAmount / (view.pot + l.callAmount);
      if (potOdds < 0.2 && pct <= 0.35) return callOrCheck(view);
      return passive(view);
    }
    if (pct <= 0.025) return raiseTo(view, l.maxRaiseTo);
    if (pct <= 0.06) return callOrCheck(view);
    return passive(view);
  }
  const eq = equityVsRandom(view.hole, view.board, opps, input.iterations ?? 500, rng);
  const potOdds = l.toCall > 0 ? l.callAmount / (view.pot + l.callAmount) : 0;
  const betSize = 0.66 * view.pot;
  const ci = comboOf(view.hole[0]!, view.hole[1]!);
  const outs = boardStrength(view.board).outs[ci]!;
  if (l.toCall === 0) {
    if (eq > 0.62) return raiseTo(view, betSize);
    if (outs >= 8 && randomFloat(rng) < 0.45) return raiseTo(view, betSize);
    if (eq < 0.3 && randomFloat(rng) < 0.12) return raiseTo(view, betSize);
    return { type: 'check' };
  }
  if (eq > 0.8) return raiseTo(view, view.currentBet * 2.5 + view.pot * 0.3);
  if (eq >= potOdds + 0.03) return { type: 'call' };
  return { type: 'fold' };
}

// ───────────────────────── Intermedio ─────────────────────────
// Tabla preflop sin posición; postflop por categoría de mano. Apuestas fijas de medio bote.

function intermediate(input: DecideInput): PokerAction {
  const { view, rng } = input;
  const l = view.legal;
  const bb = view.bigBlind;
  const pct = preflopPercentile(view.hole[0]!, view.hole[1]!);
  if (view.street === 'preflop') {
    const facing = view.currentBet > bb;
    if (pct <= 0.06) return raiseTo(view, facing ? view.currentBet * 3 : 3 * bb);
    if (!facing && pct <= 0.16) return raiseTo(view, 3 * bb);
    if (pct <= (facing ? 0.2 : 0.35)) {
      if (l.callAmount > view.players[view.seat]!.stack * 0.25 && pct > 0.08) return passive(view);
      return callOrCheck(view);
    }
    return passive(view);
  }
  const score = evaluateHoleBoard(view.hole[0]!, view.hole[1]!, view.board);
  const cat = categoryOf(score);
  const bs = boardStrength(view.board);
  const ci = comboOf(view.hole[0]!, view.hole[1]!);
  const made = bs.made[ci]!;
  const outs = drawOuts(view.hole[0]!, view.hole[1]!, view.board, score);
  const half = 0.5 * view.pot;
  if (l.toCall === 0) {
    if (made > 0.8 || cat >= 2) return raiseTo(view, half);
    if (randomInt(rng, 100) < 8) return raiseTo(view, half);
    return { type: 'check' };
  }
  const betFrac = l.callAmount / Math.max(1, view.pot - l.callAmount);
  if (cat >= 3 && made > 0.9) return raiseTo(view, view.currentBet * 2.5);
  if (made > 0.7) return { type: 'call' };
  if (made > 0.5 && betFrac <= 0.6) return { type: 'call' };
  if (outs >= 8 && betFrac <= 0.7 && view.street !== 'river') return { type: 'call' };
  return { type: 'fold' };
}

// ───────────────────────── Principiante ─────────────────────────
// Suelto y pasivo: paga demasiado, casi no sube, no considera pot odds.

function beginner(input: DecideInput): PokerAction {
  const { view, rng } = input;
  const l = view.legal;
  const bb = view.bigBlind;
  const pct = preflopPercentile(view.hole[0]!, view.hole[1]!);
  const roll = randomInt(rng, 100);
  if (view.street === 'preflop') {
    if (pct <= 0.04) return raiseTo(view, 3 * bb);
    const big = l.callAmount > 10 * bb;
    if (pct <= (big ? 0.15 : 0.6)) return callOrCheck(view);
    return roll < 10 ? callOrCheck(view) : passive(view);
  }
  const score = evaluateHoleBoard(view.hole[0]!, view.hole[1]!, view.board);
  const cat = categoryOf(score);
  const bs = boardStrength(view.board);
  const ci = comboOf(view.hole[0]!, view.hole[1]!);
  const made = bs.made[ci]!;
  const outs = bs.outs[ci]!;
  if (l.toCall === 0) {
    if (cat >= 2 && made > 0.75) return raiseTo(view, 0.5 * view.pot);
    if (roll < 5) return raiseTo(view, view.pot * 0.4);
    return { type: 'check' };
  }
  if (cat >= 1 || outs >= 4) return { type: 'call' };
  return roll < 30 ? { type: 'call' } : { type: 'fold' };
}
