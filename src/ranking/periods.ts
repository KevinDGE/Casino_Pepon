/**
 * Periodos del ranking (zona horaria de la Ciudad de México):
 * día "2026-11-05", semana ISO "2026-W45" (lunes a domingo), mes "2026-11".
 */
export type PeriodKind = 'day' | 'week' | 'month';
export const PERIOD_NAMES_ES: Record<PeriodKind, string> = { day: 'Diario', week: 'Semanal', month: 'Mensual' };
export const RANKING_TZ = 'America/Mexico_City';

function ymdIn(date: Date, tz: string): { y: number; m: number; d: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return { y: get('year'), m: get('month'), d: get('day') };
  } catch {
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Semana ISO 8601 de una fecha de calendario. */
export function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export function periodKeys(now: Date = new Date(), tz: string = RANKING_TZ): Record<PeriodKind, string> {
  const { y, m, d } = ymdIn(now, tz);
  const w = isoWeek(y, m, d);
  return { day: `${y}-${pad(m)}-${pad(d)}`, week: `${w.year}-W${pad(w.week)}`, month: `${y}-${pad(m)}` };
}

export function periodLabel(kind: PeriodKind, key: string): string {
  if (kind === 'day') {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  if (kind === 'week') return `Semana ${Number(key.split('-W')[1])} de ${key.split('-W')[0]}`;
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 15)).toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export interface PeriodTotals {
  day: string; dayNet: number; dayRounds: number;
  week: string; weekNet: number; weekRounds: number;
  month: string; monthNet: number; monthRounds: number;
}

export const emptyTotals = (now = new Date()): PeriodTotals => {
  const k = periodKeys(now);
  return { day: k.day, dayNet: 0, dayRounds: 0, week: k.week, weekNet: 0, weekRounds: 0, month: k.month, monthNet: 0, monthRounds: 0 };
};

/** Suma un resultado a los acumulados, reiniciando los periodos que cambiaron. */
export function addResult(t: PeriodTotals, net: number, rounds = 1, now = new Date()): PeriodTotals {
  const k = periodKeys(now);
  const out = { ...t };
  if (out.day !== k.day) { out.day = k.day; out.dayNet = 0; out.dayRounds = 0; }
  if (out.week !== k.week) { out.week = k.week; out.weekNet = 0; out.weekRounds = 0; }
  if (out.month !== k.month) { out.month = k.month; out.monthNet = 0; out.monthRounds = 0; }
  const n = Math.round(net);
  out.dayNet += n; out.weekNet += n; out.monthNet += n;
  out.dayRounds += rounds; out.weekRounds += rounds; out.monthRounds += rounds;
  return out;
}

/** Acumulados vigentes (los de periodos ya terminados cuentan como 0). */
export function currentTotals(t: PeriodTotals, now = new Date()): PeriodTotals {
  return addResult(t, 0, 0, now);
}
