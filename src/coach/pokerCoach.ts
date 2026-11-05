/**
 * Coach de póker: recomienda antes de actuar y revisa la mano al terminar.
 * Usa el mismo análisis que la IA Experta, pero con la vista de la persona.
 */
import type { Rng } from '../core/rng';
import type { PokerAction } from '../engine/poker/types';
import type { PokerView } from '../engine/poker/view';
import { analyze, type Analysis, type OptionEV } from '../ai/poker/analysis';
import type { ModelStore } from '../ai/poker/opponentModel';
import { fmtBB, fmtChips, fmtPct } from './format';
import { COMBO_CLASS, className, comboOf } from '../ai/poker/combos';

export interface CoachOption {
  label: string;
  kind: OptionEV['kind'];
  to: number;
  evBB: number;
  action: PokerAction;
}

export interface PokerAdvice {
  street: string;
  bigBlind: number;
  recommended: CoachOption;
  options: CoachOption[];
  equity: number;
  potOdds: number;
  toCall: number;
  pot: number;
  spr: number;
  inPosition: boolean;
  handDesc: string;
  outs: number;
  impliedBB: number;
  texture: string;
  reasons: string[];
  opponents: { name: string; style: string; width: number; vpip: number; hands: number }[];
  headline: string;
  /** Preflop sin subidas previas: se decide con tabla de apertura (los EV son orientativos). */
  openChart: boolean;
  openPct: number;
  handPct: number;
}

export function optionLabel(o: Pick<OptionEV, 'kind' | 'to' | 'added' | 'sizeFrac'>, toCall: number): string {
  switch (o.kind) {
    case 'fold': return 'Retirarse';
    case 'check': return 'Pasar';
    case 'call': return `Igualar ${fmtChips(toCall)}`;
    case 'bet': return `Apostar ${fmtChips(o.to)}${sizeName(o.sizeFrac)}`;
    case 'raise': return `Subir a ${fmtChips(o.to)}`;
    case 'allin': return `All-in (${fmtChips(o.to)})`;
  }
}

function sizeName(f: number): string {
  if (f <= 0) return '';
  if (f < 0.4) return ' (⅓ del bote)';
  if (f < 0.6) return ' (½ bote)';
  if (f < 0.85) return ' (¾ del bote)';
  if (f < 1.15) return ' (bote)';
  return ' (sobre-apuesta)';
}

/** Elige una opción "representativa" por tipo y ordena por EV. */
function summarizeOptions(an: Analysis, bb: number): CoachOption[] {
  const out: CoachOption[] = an.options.map((o) => ({
    label: optionLabel(o, an.toCall), kind: o.kind, to: o.to, evBB: o.ev / bb, action: o.action,
  }));
  out.sort((a, b) => b.evBB - a.evBB);
  return out;
}

export function pokerAdvice(view: PokerView, models: ModelStore, rng: Rng, iterations = 2500): PokerAdvice {
  const an = analyze(view, { iterations, rng, models });
  const bb = view.bigBlind;
  const options = summarizeOptions(an, bb);
  const recommended = options[0]!;
  const reasons = explain(an, recommended, view);
  const headline = `${recommended.label}`;
  return {
    street: view.street,
    bigBlind: bb,
    recommended,
    options,
    equity: an.equity,
    potOdds: an.potOdds,
    toCall: an.toCall,
    pot: an.pot,
    spr: an.spr,
    inPosition: an.inPosition,
    handDesc: an.handDesc,
    outs: an.outs,
    impliedBB: an.impliedBonus / bb,
    texture: an.texture.description,
    reasons,
    opponents: an.opponents.map((o) => ({ name: o.name, style: o.styleLabel, width: o.width, vpip: o.tendencies.vpip, hands: o.tendencies.hands })),
    headline,
    openChart: an.openChart,
    openPct: an.openPct,
    handPct: an.preflopPct,
  };
}

function explain(an: Analysis, rec: CoachOption, view: PokerView): string[] {
  const r: string[] = [];
  const bb = view.bigBlind;
  const eq = fmtPct(an.equity);
  if (view.street === 'preflop') {
    const p = an.preflopPct;
    const quality = p <= 0.08 ? 'muy fuerte' : p <= 0.2 ? 'fuerte' : p <= 0.45 ? 'jugable según la posición' : 'débil';
    const cls = className(COMBO_CLASS[comboOf(view.hole[0]!, view.hole[1]!)]!);
    r.push(`Tu mano (${cls}, ${an.handDesc.toLowerCase()}) es ${quality}: está en el top ${fmtPct(Math.max(0.01, p))} de las 1,326 combinaciones iniciales.`);
  } else {
    r.push(`Tienes ${an.handDesc.toLowerCase()}. ${an.texture.description}.`);
  }
  if (an.opponents.length) {
    r.push(`Contra los rangos probables de tus rivales, tu equity estimada (probabilidad de ganar el bote) es ${eq}.`);
  }
  if (an.toCall > 0) {
    const need = fmtPct(an.potOdds);
    r.push(
      `Pot odds: pagas ${fmtChips(an.toCall)} para ganar un bote de ${fmtChips(an.pot + an.toCall)}; necesitas ganar al menos ${need} de las veces.`,
    );
    if (an.equity >= an.potOdds + 0.03) r.push(`Tu equity (${eq}) supera lo necesario (${need}): seguir en la mano es rentable a la larga.`);
    else if (an.equity < an.potOdds - 0.03) {
      if (an.impliedBonus > 0.3 * bb) r.push(`Tu equity (${eq}) está por debajo de lo necesario (${need}), pero las implied odds (lo que puedes ganar después si ligas tu proyecto) ayudan: unas ${fmtBB(an.impliedBonus, bb)}.`);
      else r.push(`Tu equity (${eq}) está por debajo de lo necesario (${need}): pagar perdería fichas a la larga.`);
    } else r.push(`Tu equity (${eq}) está muy cerca de lo necesario (${need}): es una decisión ajustada.`);
  }
  if (an.outs >= 4 && view.street !== 'river') {
    r.push(`Tienes un proyecto con unas ${an.outs} cartas que mejoran tu mano (outs). Regla rápida: outs × ${view.street === 'flop' ? '4 (dos cartas por venir)' : '2 (una carta por venir)'} ≈ ${Math.min(60, an.outs * (view.street === 'flop' ? 4 : 2))}% de ligarlo.`);
  }
  if (view.street !== 'preflop') {
    r.push(an.inPosition ? 'Estás en posición (hablas al final): eso te permite aprovechar mejor tu equity.' : 'Estás fuera de posición (hablas primero): juega un poco más conservador con manos medianas.');
    if (an.spr < 1.5 && an.spr > 0) r.push(`El SPR (stack/bote) es ${an.spr.toFixed(1)}: con una mano buena ya estás comprometido; apostar todo es razonable.`);
  }
  const best = an.options.find((o) => o.action === rec.action || (o.kind === rec.kind && o.to === rec.to));
  if (best && (best.kind === 'bet' || best.kind === 'raise' || best.kind === 'allin')) {
    if (best.isBluff) {
      r.push(`Es una jugada de farol/semi-farol: estimamos que tus rivales se retiran ${fmtPct(best.foldProb)} de las veces y eso la hace rentable.`);
    } else {
      r.push(`Apostar busca valor: cuando te paguen, estimamos que ganarás ${fmtPct(best.eqWhenCalled)} de las veces.`);
    }
    if (view.street !== 'preflop' && an.texture.wetness >= 0.45) r.push('En tableros coordinados conviene apostar más grande para cobrar a los proyectos.');
  }
  if (best && best.kind === 'check' && an.equity > 0.55) r.push('Pasar aquí controla el tamaño del bote y deja que el rival apueste con manos peores.');
  if (an.openChart && view.street === 'preflop') {
    r.push(`Nadie ha subido todavía. Desde tu posición, con ${an.opponents.length} rival(es) en la mano, conviene abrir con el mejor ~${fmtPct(an.openPct)} de las manos; la tuya está en el ${fmtPct(Math.max(0.01, an.preflopPct))}.`);
    r.push(an.preflopPct <= an.openPct ? 'Por eso conviene entrar subiendo (no sólo igualando): tomas la iniciativa y puedes ganar las ciegas de inmediato.' : 'Tu mano está fuera de ese rango: retirarte ahora no cuesta nada y evita problemas después.');
  }
  const second = an.options.filter((o) => o !== best).sort((a, b) => b.ev - a.ev)[0];
  if (best && second && Math.abs(best.ev - second.ev) < 0.25 * bb) r.push('La diferencia con la segunda mejor opción es pequeña: ambas son aceptables.');
  return r;
}

// ───────────────────── Revisión post-mano ─────────────────────

export type DecisionGrade = 'acierto' | 'imprecision' | 'error';

export type PokerMistakeTag =
  | 'pago-sin-odds'
  | 'retiro-con-odds'
  | 'pasivo-con-mano-fuerte'
  | 'farol-sin-fold-equity'
  | 'preflop-demasiado-suelto'
  | 'preflop-demasiado-cerrado'
  | 'apuesta-mal-dimensionada';

export const TAG_TEXT: Record<PokerMistakeTag, { title: string; tip: string }> = {
  'pago-sin-odds': { title: 'Pagas sin las odds necesarias', tip: 'Antes de igualar compara tu equity con las pot odds: si tu probabilidad de ganar es menor que la que necesitas, retírate.' },
  'retiro-con-odds': { title: 'Te retiras con buenas odds', tip: 'Con apuestas pequeñas necesitas poca equity para pagar. No tires manos con proyectos o showdown value.' },
  'pasivo-con-mano-fuerte': { title: 'Juegas pasivo con manos fuertes', tip: 'Con manos fuertes apuesta o sube para cobrar valor; pasar deja fichas sobre la mesa.' },
  'farol-sin-fold-equity': { title: 'Faroles con poca probabilidad de éxito', tip: 'Farolea cuando el rival puede retirarse; contra jugadores que pagan mucho, apuesta por valor.' },
  'preflop-demasiado-suelto': { title: 'Juegas demasiadas manos preflop', tip: 'Desde posiciones tempranas abre sólo manos fuertes; amplía tu rango en el botón.' },
  'preflop-demasiado-cerrado': { title: 'Tiras manos jugables preflop', tip: 'En posición tardía o mano a mano conviene abrir más manos para robar ciegas.' },
  'apuesta-mal-dimensionada': { title: 'Tamaños de apuesta poco eficientes', tip: 'Elige el tamaño según la textura: más pequeño en tableros secos, más grande en coordinados.' },
};

export interface DecisionRecord {
  street: string;
  chosen: CoachOption;
  best: CoachOption;
  evLossBB: number;
  equity: number;
  potOdds: number;
  grade: DecisionGrade;
  tags: PokerMistakeTag[];
  comment: string;
}

/** Encuentra la opción del análisis que corresponde a la acción elegida. */
export function matchOption(advice: PokerAdvice, action: PokerAction): CoachOption {
  const kindOf = (o: CoachOption) => o.action.type;
  const same = advice.options.filter((o) => kindOf(o) === action.type);
  if (action.type !== 'raise') return same[0] ?? advice.options[advice.options.length - 1]!;
  if (!same.length) return advice.options[advice.options.length - 1]!;
  return same.reduce((a, b) => (Math.abs(b.to - action.to) < Math.abs(a.to - action.to) ? b : a));
}

export function gradeDecision(advice: PokerAdvice, action: PokerAction): DecisionRecord {
  const chosen = matchOption(advice, action);
  const best = advice.recommended;
  const bb = advice.bigBlind;
  const loss = Math.max(0, best.evBB - chosen.evBB);
  const potBB = advice.pot / bb;
  const tol = Math.max(0.2, potBB * 0.04);
  let grade: DecisionGrade = loss <= tol || chosen === best ? 'acierto' : loss <= Math.max(1, potBB * 0.15) ? 'imprecision' : 'error';
  const tags: PokerMistakeTag[] = [];
  if (grade !== 'acierto') {
    const aggressive = (k: string) => k === 'bet' || k === 'raise' || k === 'allin';
    if (chosen.kind === 'call' && advice.equity < advice.potOdds - 0.04) tags.push('pago-sin-odds');
    if (chosen.kind === 'fold' && advice.equity > advice.potOdds + 0.06) tags.push('retiro-con-odds');
    if ((chosen.kind === 'check' || chosen.kind === 'call') && aggressive(best.kind) && advice.equity > 0.6) tags.push('pasivo-con-mano-fuerte');
    if (aggressive(chosen.kind) && advice.equity < 0.35 && !aggressive(best.kind)) tags.push('farol-sin-fold-equity');
    if (advice.street === 'preflop' && chosen.kind !== 'fold' && best.kind === 'fold') tags.push('preflop-demasiado-suelto');
    if (advice.street === 'preflop' && chosen.kind === 'fold' && best.kind !== 'fold') tags.push('preflop-demasiado-cerrado');
    if (aggressive(chosen.kind) && aggressive(best.kind) && chosen.to !== best.to) tags.push('apuesta-mal-dimensionada');
    if (tags.length === 0 && grade === 'imprecision' && aggressive(chosen.kind) && aggressive(best.kind)) tags.push('apuesta-mal-dimensionada');
  }
  if (grade !== 'acierto' && tags.length === 0 && loss < 0.5) grade = 'imprecision';
  const streetName: Record<string, string> = { preflop: 'Preflop', flop: 'En el flop', turn: 'En el turn', river: 'En el river' };
  let comment: string;
  if (grade === 'acierto') {
    comment = `${streetName[advice.street]}: ${chosen.label.toLowerCase()} fue una buena decisión.`;
  } else {
    comment = `${streetName[advice.street]}: elegiste ${chosen.label.toLowerCase()} (EV ${fmtBB(chosen.evBB * bb, bb)}). Mejor: ${best.label.toLowerCase()} (EV ${fmtBB(best.evBB * bb, bb)}).`;
    if (advice.toCall > 0 && (chosen.kind === 'call' || chosen.kind === 'fold')) comment += ` Tenías ${fmtPct(advice.equity)} de equity y necesitabas ${fmtPct(advice.potOdds)}.`;
    if (tags[0]) comment += ` ${TAG_TEXT[tags[0]].tip}`;
  }
  return { street: advice.street, chosen, best, evLossBB: loss, equity: advice.equity, potOdds: advice.potOdds, grade, tags, comment };
}
