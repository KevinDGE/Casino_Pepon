import { describe, expect, it } from 'vitest';
import { addResult, currentTotals, emptyTotals, isoWeek, periodKeys } from '../../src/ranking/periods';

describe('Periodos del ranking', () => {
  it('semana ISO', () => {
    expect(isoWeek(2026, 1, 1)).toEqual({ year: 2026, week: 1 }); // jueves
    expect(isoWeek(2027, 1, 1)).toEqual({ year: 2026, week: 53 }); // viernes → semana 53 de 2026
    expect(isoWeek(2026, 11, 5)).toEqual({ year: 2026, week: 45 });
    expect(isoWeek(2026, 11, 9).week).toBe(46); // lunes
  });
  it('claves en horario de la Ciudad de México', () => {
    // 2026-11-06 03:00 UTC = 2026-11-05 21:00 en CDMX (UTC−6)
    expect(periodKeys(new Date('2026-11-06T03:00:00Z')).day).toBe('2026-11-05');
    expect(periodKeys(new Date('2026-11-06T07:00:00Z')).day).toBe('2026-11-06');
    expect(periodKeys(new Date('2026-11-06T07:00:00Z')).month).toBe('2026-11');
  });
  it('acumula y reinicia al cambiar de periodo', () => {
    const d1 = new Date('2026-11-05T18:00:00Z');
    let t = emptyTotals(d1);
    t = addResult(t, 100, 1, d1);
    t = addResult(t, -30, 1, d1);
    expect([t.dayNet, t.weekNet, t.monthNet, t.dayRounds]).toEqual([70, 70, 70, 2]);
    const nextDay = new Date('2026-11-06T18:00:00Z');
    t = addResult(t, 10, 1, nextDay);
    expect([t.dayNet, t.weekNet, t.monthNet]).toEqual([10, 80, 80]);
    const nextWeek = new Date('2026-11-10T18:00:00Z');
    expect(currentTotals(t, nextWeek).weekNet).toBe(0);
    expect(currentTotals(t, nextWeek).monthNet).toBe(80);
    expect(currentTotals(t, new Date('2026-12-02T18:00:00Z')).monthNet).toBe(0);
  });
});
