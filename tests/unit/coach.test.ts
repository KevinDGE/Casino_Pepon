import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/core/rng';
import { createGame, startHand, applyAction } from '../../src/engine/poker/game';
import { getPlayerView } from '../../src/engine/poker/view';
import { pokerAdvice, gradeDecision } from '../../src/coach/pokerCoach';
import { bjAdvice, bjInsuranceAdvice, gradeBJ } from '../../src/coach/blackjackCoach';
import { rouletteAdvice, betInfo, HOUSE_EDGE } from '../../src/coach/rouletteCoach';
import { createBlackjack, startRound, buildShoe } from '../../src/engine/blackjack/game';
import { DEFAULT_RULES } from '../../src/engine/blackjack/types';
import { outsideNumbers } from '../../src/engine/roulette/roulette';
import { cs } from './helpers';

function pokerSpot(hole: string, setup?: (g: ReturnType<typeof createGame>) => void) {
  const g = createGame({ smallBlind: 50, bigBlind: 100, blindIncreaseEvery: 0 }, Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0, stack: 10000 })), 0);
  startHand(g, new SeededRng(8));
  g.players[0]!.hole = cs(hole);
  setup?.(g);
  return g;
}

describe('Coach de póker', () => {
  it('recomienda subir con AA desde el botón y explica en español', () => {
    const g = pokerSpot('As Ah');
    const a = pokerAdvice(getPlayerView(g, 0), {}, new SeededRng(1), 600);
    expect(['raise', 'bet']).toContain(a.recommended.kind);
    expect(a.reasons.length).toBeGreaterThan(1);
    expect(a.reasons.join(' ')).toMatch(/equity|mano/i);
    expect(a.openChart).toBe(true);
  });

  it('muestra pot odds y califica como error retirarse con AA', () => {
    const g = pokerSpot('Ks Kh', (g) => {
      applyAction(g, { type: 'call' }); // botón iguala
      applyAction(g, { type: 'call' }); // SB iguala
      applyAction(g, { type: 'check' }); // BB pasa → flop
    });
    // Ahora en el flop habla SB (asiento 1); avanzamos hasta el botón (0) con una apuesta.
    applyAction(g, { type: 'raise', to: 200 });
    applyAction(g, { type: 'call' });
    const v = getPlayerView(g, 0);
    const a = pokerAdvice(v, {}, new SeededRng(2), 800);
    expect(a.toCall).toBe(200);
    expect(a.potOdds).toBeCloseTo(200 / (v.pot + 200), 5);
    const fold = gradeDecision(a, { type: 'fold' });
    if (a.equity > a.potOdds + 0.1) {
      expect(fold.grade).not.toBe('acierto');
      expect(fold.comment.length).toBeGreaterThan(10);
    }
    const best = gradeDecision(a, a.recommended.action);
    expect(best.grade).toBe('acierto');
  });
});

describe('Coach de blackjack', () => {
  const r = new SeededRng(3);
  const shoe = (order: string) => [...cs(order), ...buildShoe(1)];
  it('16 contra 10: pedir; 11 contra 6: doblar', () => {
    const t = createBlackjack({ ...DEFAULT_RULES }, [{ id: 'h', name: 'Tú', isHuman: true, bankroll: 1000 }], r);
    startRound(t, [100], r, shoe('Ts Kd 6c 7h'));
    const a = bjAdvice(t)!;
    expect(a.best).toBe('hit');
    expect(a.reasons.join(' ')).toMatch(/crupier/);
    const t2 = createBlackjack({ ...DEFAULT_RULES }, [{ id: 'h', name: 'Tú', isHuman: true, bankroll: 1000 }], r);
    startRound(t2, [100], r, shoe('6s 6d 5c 9h'));
    expect(bjAdvice(t2)!.best).toBe('double');
    const g = gradeBJ(t2, bjAdvice(t2)!, 'stand');
    expect(g.grade).toBe('error');
    expect(g.tags).toContain('dobles');
  });
  it('el seguro no conviene con un zapato normal', () => {
    const t = createBlackjack({ ...DEFAULT_RULES }, [{ id: 'h', name: 'Tú', isHuman: true, bankroll: 1000 }], r);
    startRound(t, [100], r, shoe('Ts Ad 9c 7h'));
    const ins = bjInsuranceAdvice(t);
    expect(ins.take).toBe(false);
    expect(ins.ev).toBeLessThan(0);
  });
});

describe('Coach de ruleta', () => {
  it('pérdida esperada = 2.70 % de lo apostado y probabilidades correctas', () => {
    const a = rouletteAdvice([{ kind: 'red', numbers: outsideNumbers('red'), amount: 100 }]);
    expect(a.expectedLoss).toBeCloseTo(100 * HOUSE_EDGE, 8);
    expect(a.pAnyWin).toBeCloseTo(18 / 37, 8);
    expect(a.pProfit).toBeCloseTo(18 / 37, 8);
    expect(a.stdDev).toBeGreaterThan(90);
    expect(betInfo(1).payout).toBe(35);
    expect(betInfo(1).ev).toBeCloseTo(-1 / 37, 10);
    const none = rouletteAdvice([]);
    expect(none.total).toBe(0);
  });
});
