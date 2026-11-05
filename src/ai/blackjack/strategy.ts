/**
 * Niveles de juego de blackjack (para compañeros de mesa de IA, coach y simulaciones).
 * Ninguno ve la carta oculta ni el orden del zapato: sólo cartas visibles.
 */
import { cardValue, handTotal } from '../../engine/blackjack/hand';
import { getLegal, maxInsurance, remainingComposition } from '../../engine/blackjack/game';
import type { BJAction, BJState, BlackjackRules } from '../../engine/blackjack/types';
import { computeEVs, fullComposition, insuranceEV, type ActionEVs } from './ev';

export type BJLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface BJDecisionContext {
  rules: BlackjackRules;
  playerValues: number[];
  up: number;
  legal: { hit: boolean; stand: boolean; double: boolean; split: boolean };
  handsCount: number;
  splitAces: boolean;
  peeked: boolean;
}

/** Contexto de decisión para el turno actual a partir del estado del motor. */
export function contextFromState(state: BJState): BJDecisionContext | null {
  if (!state.turn) return null;
  const s = state.seats[state.turn.seat]!;
  const h = s.hands[state.turn.hand]!;
  const upV = cardValue(state.dealer[0]!);
  return {
    rules: state.rules,
    playerValues: h.cards.map(cardValue),
    up: upV,
    legal: getLegal(state),
    handsCount: s.hands.length,
    splitAces: h.splitAces,
    peeked: state.rules.dealerPeeks && (upV === 1 || upV === 10),
  };
}

export function evsFor(ctx: BJDecisionContext, comp: readonly number[]): ActionEVs {
  return computeEVs({
    rules: ctx.rules,
    comp,
    player: ctx.playerValues,
    up: ctx.up,
    canDouble: ctx.legal.double,
    canSplit: ctx.legal.split,
    handsCount: ctx.handsCount,
    splitAces: ctx.splitAces,
    peeked: ctx.peeked,
  });
}

// Caché de estrategia básica (composición de zapato completo) por reglas y situación.
const basicCache = new Map<string, BJAction>();

export function basicStrategy(ctx: BJDecisionContext): BJAction {
  const r = ctx.rules;
  const key = [
    r.decks, r.dealerHitsSoft17, r.doubleAfterSplit, r.doubleOn, r.maxHands, r.resplitAces, r.hitSplitAces, r.dealerPeeks,
    ctx.playerValues.slice().sort((a, b) => a - b).join('.'), ctx.up, ctx.legal.double, ctx.legal.split, ctx.legal.hit,
    Math.min(ctx.handsCount, 4), ctx.splitAces,
  ].join('|');
  const cached = basicCache.get(key);
  if (cached) return cached;
  // Estrategia básica "dependiente del total": zapato completo menos las cartas de la mano y la visible.
  const comp = fullComposition(r.decks);
  for (const v of [...ctx.playerValues, ctx.up]) comp[v] = Math.max(0, comp[v]! - 1);
  const evs = evsFor(ctx, comp);
  basicCache.set(key, evs.best);
  return evs.best;
}

function legalOr(ctx: BJDecisionContext, preferred: BJAction, fallback: BJAction): BJAction {
  return ctx.legal[preferred] ? preferred : ctx.legal[fallback] ? fallback : 'stand';
}

export function decideBJ(level: BJLevel, state: BJState): BJAction {
  const ctx = contextFromState(state);
  if (!ctx) throw new Error('Sin turno');
  const { total, soft } = handTotal(state.seats[state.turn!.seat]!.hands[state.turn!.hand]!.cards);
  switch (level) {
    case 'beginner': {
      // "Nunca pasarse": se planta con 12 o más duro.
      if (ctx.legal.split && ctx.playerValues[0] === 1) return 'split';
      if (total === 11 && ctx.legal.double) return 'double';
      if (soft) return total >= 17 ? 'stand' : legalOr(ctx, 'hit', 'stand');
      return total >= 12 ? 'stand' : legalOr(ctx, 'hit', 'stand');
    }
    case 'intermediate': {
      // "Imitar al crupier" con algunos dobles y divisiones clásicas.
      const v = ctx.playerValues[0]!;
      if (ctx.legal.split && (v === 1 || v === 8)) return 'split';
      if (ctx.legal.double && !soft && (total === 10 || total === 11) && ctx.up >= 2 && ctx.up <= 9) return 'double';
      if (soft) return total >= 18 ? 'stand' : legalOr(ctx, 'hit', 'stand');
      return total >= 17 ? 'stand' : legalOr(ctx, 'hit', 'stand');
    }
    case 'advanced':
      return basicStrategy(ctx);
    case 'expert':
      return evsFor(ctx, remainingComposition(state, 'seen')).best;
  }
}

export function decideInsuranceAI(level: BJLevel, state: BJState, seat: number): number {
  const max = maxInsurance(state, seat);
  switch (level) {
    case 'beginner':
      return max; // "Protegerse" siempre (un error clásico).
    case 'intermediate':
    case 'advanced':
      return 0;
    case 'expert':
      return insuranceEV(remainingComposition(state, 'seen')).ev > 0 ? max : 0;
  }
}
