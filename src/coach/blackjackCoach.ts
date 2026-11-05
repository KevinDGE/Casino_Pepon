/**
 * Coach de blackjack: EV de cada acción según las reglas activas y las cartas
 * visibles de la ronda (nunca la carta oculta ni el orden del zapato).
 */
import type { BJAction, BJState } from '../engine/blackjack/types';
import { contextFromState, evsFor } from '../ai/blackjack/strategy';
import { insuranceEV } from '../ai/blackjack/ev';
import { remainingComposition } from '../engine/blackjack/game';
import { handTotal } from '../engine/blackjack/hand';
import { fmtPct } from './format';

export const BJ_ACTION_ES: Record<BJAction, string> = {
  hit: 'Pedir',
  stand: 'Plantarse',
  double: 'Doblar',
  split: 'Dividir',
};

export interface BJAdvice {
  best: BJAction;
  evs: { action: BJAction; ev: number }[];
  dealerBust: number;
  bustIfHit: number;
  reasons: string[];
}

const UP_NAME = (v: number) => (v === 1 ? 'un As' : v === 10 ? 'un 10' : `un ${v}`);

export function bjAdvice(state: BJState): BJAdvice | null {
  const ctx = contextFromState(state);
  if (!ctx) return null;
  const comp = remainingComposition(state, 'round');
  const e = evsFor(ctx, comp);
  const evs: { action: BJAction; ev: number }[] = [];
  if (ctx.legal.hit && e.hit !== null) evs.push({ action: 'hit', ev: e.hit });
  evs.push({ action: 'stand', ev: e.stand });
  if (ctx.legal.double && e.double !== null) evs.push({ action: 'double', ev: e.double });
  if (ctx.legal.split && e.split !== null) evs.push({ action: 'split', ev: e.split });
  evs.sort((a, b) => b.ev - a.ev);
  const best = evs[0]!.action;
  const h = state.seats[state.turn!.seat]!.hands[state.turn!.hand]!;
  const { total, soft } = handTotal(h.cards);
  const dealerBust = e.dealer[5]!;
  const reasons: string[] = [];
  reasons.push(`Tienes ${soft ? `${total} blando (el As puede valer 1 u 11)` : total} contra ${UP_NAME(ctx.up)} del crupier.`);
  reasons.push(`Con esa carta, el crupier se pasa aproximadamente ${fmtPct(dealerBust)} de las veces.`);
  if (ctx.legal.hit && !soft && total >= 12) reasons.push(`Si pides, la probabilidad de pasarte es ${fmtPct(e.bustIfHit)}.`);
  const evTxt = evs.map((x) => `${BJ_ACTION_ES[x.action]}: ${x.ev >= 0 ? '+' : ''}${(x.ev * 100).toFixed(1)}%`).join(' · ');
  reasons.push(`Valor esperado por apuesta: ${evTxt}.`);
  if (best === 'double') reasons.push('Doblar conviene porque tu ventaja es grande: duplicas la apuesta justo cuando es más probable ganar.');
  if (best === 'split') reasons.push('Dividir convierte una mano mala (o una buena) en dos manos con mejor expectativa.');
  if (best === 'stand' && total <= 16 && ctx.up >= 2 && ctx.up <= 6) reasons.push('Contra una carta baja del crupier, deja que él corra el riesgo de pasarse.');
  if (best === 'hit' && total >= 12 && total <= 16 && ctx.up >= 7) reasons.push('Contra una carta alta del crupier, plantarte con poco suele perder: es mejor arriesgar.');
  if (evs.length > 1 && evs[0]!.ev - evs[1]!.ev < 0.01) reasons.push('Las dos mejores opciones están casi empatadas.');
  return { best, evs, dealerBust, bustIfHit: e.bustIfHit, reasons };
}

export interface InsuranceAdvice {
  take: boolean;
  ev: number;
  tenProb: number;
  reasons: string[];
}

export function bjInsuranceAdvice(state: BJState): InsuranceAdvice {
  const { ev, tenProb } = insuranceEV(remainingComposition(state, 'round'));
  const take = ev > 0;
  return {
    take,
    ev,
    tenProb,
    reasons: [
      'El seguro cuesta la mitad de tu apuesta y paga 2:1 sólo si la carta oculta del crupier vale 10.',
      `Con las cartas visibles, esa probabilidad es ${fmtPct(tenProb, 1)}; para que convenga debe superar 33.3%.`,
      take
        ? `Aquí conviene: su valor esperado es +${(ev * 100).toFixed(1)}% de tu apuesta.`
        : `No conviene: su valor esperado es ${(ev * 100).toFixed(1)}% de tu apuesta. Tampoco "protege" tu blackjack: es una apuesta aparte con desventaja.`,
    ],
  };
}

export type BJTag = 'manos-blandas' | 'pares' | 'dobles' | 'plantarse-pronto' | 'pedir-de-mas' | 'seguro';

export const BJ_TAG_TEXT: Record<BJTag, { title: string; tip: string }> = {
  'manos-blandas': { title: 'Manos blandas', tip: 'Con un As que vale 11 no te puedes pasar al pedir: juega más agresivo, sobre todo con 13–18 blando.' },
  pares: { title: 'Decisiones de dividir', tip: 'Divide siempre ases y ochos; nunca dieces ni cincos.' },
  dobles: { title: 'Dobles', tip: 'Dobla 11 casi siempre y 10 contra 2–9; no desaproveches tus mejores momentos.' },
  'plantarse-pronto': { title: 'Te plantas demasiado pronto', tip: 'Con 12–16 contra 7, 8, 9, 10 o As del crupier normalmente hay que pedir.' },
  'pedir-de-mas': { title: 'Pides de más', tip: 'Con 13–16 contra 2–6 del crupier, plantarte deja que él se pase.' },
  seguro: { title: 'Seguro', tip: 'El seguro casi nunca conviene: sólo cuando quedan muchísimos dieces en el zapato.' },
};

export interface BJDecision {
  chosen: BJAction | 'insurance-yes' | 'insurance-no';
  best: BJAction | 'insurance-yes' | 'insurance-no';
  evLoss: number;
  grade: 'acierto' | 'imprecision' | 'error';
  tags: BJTag[];
  comment: string;
}

export function gradeBJ(state: BJState, advice: BJAdvice, chosen: BJAction): BJDecision {
  const bestEV = advice.evs[0]!.ev;
  const ch = advice.evs.find((x) => x.action === chosen);
  const loss = ch ? Math.max(0, bestEV - ch.ev) : 0;
  const grade = loss <= 0.004 ? 'acierto' : loss <= 0.04 ? 'imprecision' : 'error';
  const tags: BJTag[] = [];
  const h = state.seats[state.turn!.seat]!.hands[state.turn!.hand]!;
  const { total, soft } = handTotal(h.cards);
  if (grade !== 'acierto') {
    if (soft) tags.push('manos-blandas');
    if (chosen === 'split' || advice.best === 'split') tags.push('pares');
    if (chosen === 'double' || advice.best === 'double') tags.push('dobles');
    if (chosen === 'stand' && advice.best === 'hit') tags.push('plantarse-pronto');
    if (chosen === 'hit' && advice.best === 'stand') tags.push('pedir-de-mas');
  }
  const comment =
    grade === 'acierto'
      ? `${BJ_ACTION_ES[chosen]} con ${total}${soft ? ' blando' : ''}: correcto.`
      : `${BJ_ACTION_ES[chosen]} con ${total}${soft ? ' blando' : ''} cuesta ${(loss * 100).toFixed(1)}% de la apuesta frente a ${BJ_ACTION_ES[advice.best].toLowerCase()}.${tags[0] ? ' ' + BJ_TAG_TEXT[tags[0]].tip : ''}`;
  return { chosen, best: advice.best, evLoss: loss, grade, tags, comment };
}

export function gradeInsurance(advice: InsuranceAdvice, took: boolean): BJDecision {
  const correct = took === advice.take;
  const loss = correct ? 0 : Math.abs(advice.ev) * 1;
  return {
    chosen: took ? 'insurance-yes' : 'insurance-no',
    best: advice.take ? 'insurance-yes' : 'insurance-no',
    evLoss: loss,
    grade: correct ? 'acierto' : loss > 0.02 ? 'error' : 'imprecision',
    tags: correct ? [] : ['seguro'],
    comment: correct
      ? took ? 'Tomaste el seguro cuando convenía.' : 'Rechazar el seguro fue correcto.'
      : took ? `El seguro tenía EV ${(advice.ev * 100).toFixed(1)}%: mejor rechazarlo.` : 'Aquí el seguro tenía EV positivo por los dieces restantes.',
  };
}
