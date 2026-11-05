import { describe, expect, it } from 'vitest';
import {
  applyBJAction, createBlackjack, decideInsurance, getLegal, startRound, seatRoundNet, remainingComposition, buildShoe,
} from '../../src/engine/blackjack/game';
import { handTotal, isBlackjack, cardValue } from '../../src/engine/blackjack/hand';
import { DEFAULT_RULES, type BlackjackRules, type BJState } from '../../src/engine/blackjack/types';
import { SeededRng, randomInt } from '../../src/core/rng';
import { cs, c } from './helpers';
import { computeEVs, fullComposition, insuranceEV, dealerDistribution, probabilities, standEV } from '../../src/ai/blackjack/ev';
import { basicStrategy, decideBJ, decideInsuranceAI, type BJLevel } from '../../src/ai/blackjack/strategy';

const rng = new SeededRng(5);

/** Zapato amañado: `order` en orden de reparto real, seguido de relleno. */
function shoe(order: string): number[] {
  const first = cs(order);
  return [...first, ...buildShoe(1)];
}

function table(rules: Partial<BlackjackRules> = {}, seats = 1, bankroll = 1000): BJState {
  return createBlackjack(
    { ...DEFAULT_RULES, ...rules },
    Array.from({ length: seats }, (_, i) => ({ id: `s${i}`, name: `S${i}`, isHuman: i === 0, bankroll })),
    rng,
  );
}

describe('Blackjack: manos', () => {
  it('calcula totales duros y blandos', () => {
    expect(handTotal(cs('As 6d'))).toEqual({ total: 17, soft: true });
    expect(handTotal(cs('As 6d Kc'))).toEqual({ total: 17, soft: false });
    expect(handTotal(cs('As Ad 9c'))).toEqual({ total: 21, soft: true });
    expect(handTotal(cs('Ks Qd 5c'))).toEqual({ total: 25, soft: false });
    expect(isBlackjack(cs('As Jd'))).toBe(true);
    expect(isBlackjack(cs('7s 7d 7c'))).toBe(false);
    expect(cardValue(c('Qh'))).toBe(10);
    expect(cardValue(c('Ah'))).toBe(1);
  });
});

describe('Blackjack: pagos', () => {
  it('blackjack paga 3:2', () => {
    const t = table();
    // jugador A, crupier 9, jugador K, oculta 7
    startRound(t, [100], rng, shoe('As 9d Kc 7h'));
    expect(t.phase).toBe('settled');
    expect(t.seats[0]!.hands[0]!.outcome).toBe('blackjack');
    expect(t.seats[0]!.bankroll).toBe(1150);
  });

  it('blackjack paga 6:5 si la regla lo indica', () => {
    const t = table({ blackjackPays: '6:5' });
    startRound(t, [100], rng, shoe('As 9d Kc 7h'));
    expect(t.seats[0]!.bankroll).toBe(1120);
  });

  it('gana, empata y pierde contra el crupier', () => {
    const t = table();
    startRound(t, [100], rng, shoe('Ts 9d Qc 8h')); // 20 vs 17
    applyBJAction(t, 'stand');
    expect(t.seats[0]!.hands[0]!.outcome).toBe('win');
    expect(t.seats[0]!.bankroll).toBe(1100);
    startRound(t, [100], rng, shoe('Ts 9d 8c 8h')); // 18 vs 17
    applyBJAction(t, 'stand');
    expect(t.seats[0]!.bankroll).toBe(1200);
    startRound(t, [100], rng, shoe('Ts 9d 7c 8h')); // 17 vs 17
    applyBJAction(t, 'stand');
    expect(t.seats[0]!.hands[0]!.outcome).toBe('push');
    expect(t.seats[0]!.bankroll).toBe(1200);
    startRound(t, [100], rng, shoe('Ts Td 6c 9h')); // 16 vs 19
    applyBJAction(t, 'stand');
    expect(t.seats[0]!.hands[0]!.outcome).toBe('lose');
    expect(t.seats[0]!.bankroll).toBe(1100);
  });

  it('pasarse pierde aunque el crupier también se pase', () => {
    const t = table();
    startRound(t, [100], rng, shoe('Ts 6d 6c Th 9s 8c'));
    applyBJAction(t, 'hit'); // 16 + 9 = 25
    expect(t.seats[0]!.hands[0]!.outcome).toBe('bust');
    expect(t.dealer.length).toBe(2); // el crupier no pide si no hay manos vivas
    expect(t.seats[0]!.bankroll).toBe(900);
  });
});

describe('Blackjack: crupier', () => {
  it('S17: se planta con 17 suave; H17: pide', () => {
    const s17 = table({ dealerHitsSoft17: false });
    startRound(s17, [100], rng, shoe('Ts Ad 8c 6h 5s'));
    decideInsurance(s17, 0, 0);
    applyBJAction(s17, 'stand');
    expect(s17.dealer.length).toBe(2);
    expect(s17.seats[0]!.hands[0]!.outcome).toBe('win');
    const h17 = table({ dealerHitsSoft17: true });
    startRound(h17, [100], rng, shoe('Ts Ad 8c 6h 3s'));
    decideInsurance(h17, 0, 0);
    applyBJAction(h17, 'stand');
    expect(h17.dealer.length).toBe(3); // A+6+3 = 20
    expect(h17.seats[0]!.hands[0]!.outcome).toBe('lose');
  });
});

describe('Blackjack: doblar', () => {
  it('doblar duplica la apuesta y da exactamente una carta', () => {
    const t = table();
    startRound(t, [100], rng, shoe('6s 5d 5c Th Ts 2c'));
    expect(getLegal(t).double).toBe(true);
    applyBJAction(t, 'double');
    const h = t.seats[0]!.hands[0]!;
    expect(h.cards.length).toBe(3);
    expect(h.bet).toBe(200);
    expect(h.outcome).toBe('win'); // 21 vs 15 → crupier pide 2 = 17
    expect(t.seats[0]!.bankroll).toBe(1200);
  });

  it('no se puede doblar sin fichas o con más de dos cartas', () => {
    const t = table({}, 1, 100);
    startRound(t, [100], rng, shoe('6s 5d 5c Th'));
    expect(getLegal(t).double).toBe(false);
    const t2 = table();
    startRound(t2, [100], rng, shoe('2s 5d 3c Th 2h'));
    applyBJAction(t2, 'hit');
    expect(getLegal(t2).double).toBe(false);
  });

  it('respeta "doblar sólo 9-11"', () => {
    const t = table({ doubleOn: '9-11' });
    startRound(t, [100], rng, shoe('As 5d 7c Th'));
    expect(getLegal(t).double).toBe(false);
  });
});

describe('Blackjack: dividir', () => {
  it('dividir crea dos manos con su propia apuesta', () => {
    const t = table();
    // jugador 8, crupier 6, jugador 8, oculta T; luego 3 (mano 1), K (mano 2)
    startRound(t, [100], rng, shoe('8s 6d 8c Th 3s Kc Td'));
    expect(getLegal(t).split).toBe(true);
    applyBJAction(t, 'split');
    const s = t.seats[0]!;
    expect(s.hands.length).toBe(2);
    expect(s.bankroll).toBe(800);
    expect(s.hands[0]!.cards.length).toBe(2); // 8+3 = 11
    expect(getLegal(t).double).toBe(true); // DAS
    applyBJAction(t, 'double'); // 11 + T = 21
    applyBJAction(t, 'stand'); // segunda mano 8 + K = 18
    expect(t.phase).toBe('settled');
    // crupier 6 + T = 16, pide... siguiente carta del relleno
    expect(seatRoundNet(s)).toBe(s.bankroll - 1000);
  });

  it('sin DAS no se puede doblar tras dividir', () => {
    const t = table({ doubleAfterSplit: false });
    startRound(t, [100], rng, shoe('8s 6d 8c Th 3s Kc'));
    applyBJAction(t, 'split');
    expect(getLegal(t).double).toBe(false);
  });

  it('ases divididos reciben una sola carta y 21 paga 1:1', () => {
    const t = table();
    startRound(t, [100], rng, shoe('As 9d Ac 8h Kc Qd'));
    applyBJAction(t, 'split');
    expect(t.phase).toBe('settled');
    const s = t.seats[0]!;
    expect(s.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(s.hands.every((h) => h.outcome === 'win')).toBe(true);
    expect(s.bankroll).toBe(1200); // +100 +100, no 3:2
  });

  it('re-divide hasta el máximo de manos', () => {
    const t = table({ maxHands: 3 });
    startRound(t, [100], rng, shoe('8s 6d 8c Th 8h 8d 2c 3c 4c'));
    applyBJAction(t, 'split'); // mano 0 recibe 8 → par otra vez
    expect(getLegal(t).split).toBe(true);
    applyBJAction(t, 'split'); // 3 manos
    expect(t.seats[0]!.hands.length).toBe(3);
    expect(getLegal(t).split).toBe(false); // mano 0 = 8+8 de nuevo, pero ya hay 3
  });
});

describe('Blackjack: seguro', () => {
  it('el seguro paga 2:1 si el crupier tiene blackjack (con revisión)', () => {
    const t = table();
    startRound(t, [100], rng, shoe('Ts Ad 9c Kh'));
    expect(t.phase).toBe('insurance');
    decideInsurance(t, 0, 50);
    expect(t.phase).toBe('settled');
    const s = t.seats[0]!;
    expect(s.hands[0]!.outcome).toBe('lose');
    expect(s.insuranceNet).toBe(100);
    expect(s.bankroll).toBe(1000); // −100 de la mano +100 del seguro
  });

  it('el seguro se pierde si el crupier no tiene blackjack', () => {
    const t = table();
    startRound(t, [100], rng, shoe('Ts Ad 9c 7h'));
    decideInsurance(t, 0, 50);
    expect(t.phase).toBe('playing');
    applyBJAction(t, 'stand'); // 19 vs 18
    const s = t.seats[0]!;
    expect(s.insuranceNet).toBe(-50);
    expect(s.bankroll).toBe(1050);
  });

  it('blackjack del jugador contra blackjack del crupier es empate', () => {
    const t = table();
    startRound(t, [100], rng, shoe('As Ad Kc Kh'));
    decideInsurance(t, 0, 0);
    expect(t.seats[0]!.hands[0]!.outcome).toBe('push');
    expect(t.seats[0]!.bankroll).toBe(1000);
  });

  it('el seguro máximo es la mitad de la apuesta', () => {
    const t = table();
    startRound(t, [100], rng, shoe('Ts Ad 9c 7h'));
    decideInsurance(t, 0, 500);
    expect(t.seats[0]!.insurance).toBe(50);
  });

  it('sin revisión (ENHC) el blackjack del crupier se lleva también los dobles', () => {
    const t = table({ dealerPeeks: false });
    startRound(t, [100], rng, shoe('6s Td 5c Ah 9s'));
    expect(t.phase).toBe('playing');
    applyBJAction(t, 'double');
    expect(t.seats[0]!.hands[0]!.outcome).toBe('lose');
    expect(t.seats[0]!.bankroll).toBe(800);
  });
});

describe('Blackjack: privacidad de la IA', () => {
  it('la composición nunca descuenta la carta oculta', () => {
    const t = table();
    startRound(t, [100], rng, shoe('Ts 9d Qc Kh'));
    const comp = remainingComposition(t, 'round');
    // Visibles: T, 9, Q → 2 dieces y un nueve. La K oculta no se descuenta.
    expect(comp[10]).toBe(16 * 6 - 2);
    expect(comp[9]).toBe(4 * 6 - 1);
    expect(t.seen.length).toBe(3);
  });
});

describe('Blackjack: EV y estrategia básica', () => {
  const rules: BlackjackRules = { ...DEFAULT_RULES, decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true };
  const ctx = (player: number[], up: number, legal = { hit: true, stand: true, double: true, split: player.length === 2 && player[0] === player[1] }) => ({
    rules, playerValues: player, up, legal, handsCount: 1, splitAces: false, peeked: up === 1 || up === 10,
  });
  const bs = (player: number[], up: number) => basicStrategy(ctx(player, up));

  it('coincide con la estrategia básica publicada (6 mazos, S17, DAS)', () => {
    expect(bs([10, 6], 10)).toBe('hit');
    expect(bs([10, 2], 2)).toBe('hit');
    expect(bs([10, 2], 4)).toBe('stand');
    expect(bs([10, 3], 2)).toBe('stand');
    expect(bs([6, 5], 10)).toBe('double');
    expect(bs([6, 5], 1)).toBe('hit');
    expect(bs([6, 4], 9)).toBe('double');
    expect(bs([5, 4], 2)).toBe('hit');
    expect(bs([5, 4], 3)).toBe('double');
    expect(bs([1, 7], 9)).toBe('hit');
    expect(bs([1, 7], 2)).toBe('stand');
    expect(bs([1, 7], 6)).toBe('double');
    expect(bs([1, 6], 3)).toBe('double');
    expect(bs([1, 2], 5)).toBe('double');
    expect(bs([8, 8], 10)).toBe('split');
    expect(bs([10, 10], 6)).toBe('stand');
    expect(bs([9, 9], 7)).toBe('stand');
    expect(bs([9, 9], 8)).toBe('split');
    expect(bs([1, 1], 1)).toBe('split');
    expect(bs([5, 5], 9)).toBe('double');
    expect(bs([4, 4], 5)).toBe('split');
    expect(bs([2, 2], 7)).toBe('split');
    expect(bs([6, 6], 2)).toBe('split');
    expect(bs([7, 7], 8)).toBe('hit');
    expect(bs([10, 7], 1)).toBe('stand');
  });

  it('con H17 dobla 11 contra As', () => {
    const r2 = { ...rules, dealerHitsSoft17: true };
    expect(basicStrategy({ ...ctx([6, 5], 1), rules: r2 })).toBe('double');
  });

  it('la distribución del crupier suma 1 y coincide con valores conocidos', () => {
    const p = probabilities(fullComposition(1000));
    const d6 = dealerDistribution(p, 6, rules, false);
    expect(d6.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(d6[5]).toBeCloseTo(0.4208, 2); // P(pasarse | 6) en S17 ≈ 42%
    const dA = dealerDistribution(p, 1, rules, false);
    expect(dA[6]).toBeCloseTo(4 / 13, 3); // P(BJ | As visible)
  });

  it('el EV calculado coincide con una simulación Monte Carlo (16 vs 10, 11 vs 6)', () => {
    const big = fullComposition(1000);
    const r = new SeededRng(11);
    const drawV = () => {
      const x = randomInt(r, 13);
      return x >= 9 ? 10 : x === 0 ? 1 : x + 1;
    };
    const dealerFinal = (up: number): number => {
      // condicionado a que no hay blackjack (revisión)
      let hole: number;
      do hole = drawV(); while ((up === 10 && hole === 1) || (up === 1 && hole === 10));
      const vals = [up, hole];
      for (;;) {
        let t = vals.reduce((a, b) => a + b, 0);
        const soft = vals.includes(1) && t + 10 <= 21;
        if (soft) t += 10;
        if (t >= 17) return t;
        vals.push(drawV());
      }
    };
    const N = 400_000;
    let standSum = 0;
    let dblSum = 0;
    for (let i = 0; i < N; i++) {
      const d = dealerFinal(10);
      standSum += d > 21 ? 1 : 16 > d ? 1 : 16 === d ? 0 : -1;
      // 11 vs 6: doblar
      const pv = 11 + drawV();
      const pt = pv === 12 && false ? 22 : pv; // (11 + As = 12)
      const d6 = dealerFinal(6);
      dblSum += 2 * (d6 > 21 ? 1 : pt > d6 ? 1 : pt === d6 ? 0 : -1);
    }
    const ev16 = computeEVs({ rules, comp: big, player: [10, 6], up: 10, canDouble: false, canSplit: false, handsCount: 1, splitAces: false, peeked: true });
    const ev11 = computeEVs({ rules, comp: big, player: [6, 5], up: 6, canDouble: true, canSplit: false, handsCount: 1, splitAces: false, peeked: false });
    expect(Math.abs(standSum / N - ev16.stand)).toBeLessThan(0.006);
    expect(Math.abs(dblSum / N - ev11.double!)).toBeLessThan(0.012);
    expect(standEV(22, [0, 0, 0, 0, 0, 1, 0])).toBe(-1);
  });

  it('el seguro tiene EV negativo con zapato completo y positivo con muchos dieces', () => {
    expect(insuranceEV(fullComposition(6)).ev).toBeLessThan(0);
    const rich = fullComposition(1);
    for (let v = 2; v <= 9; v++) rich[v] = 1;
    expect(insuranceEV(rich).ev).toBeGreaterThan(0);
  });
});

describe('Blackjack: conservación de fichas y niveles de IA', () => {
  it('las fichas se conservan en 20,000 rondas con todos los niveles', () => {
    const r = new SeededRng(21);
    const levels: BJLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
    const t = createBlackjack({ ...DEFAULT_RULES, decks: 2 }, levels.map((l, i) => ({ id: l, name: l, isHuman: false, bankroll: 1_000_000 + i })), r);
    let ledger = t.seats.map((s) => s.bankroll);
    for (let round = 0; round < 5000; round++) {
      const bets = t.seats.map(() => 10 + randomInt(r, 3) * 10);
      startRound(t, bets, r);
      if (t.phase === 'insurance') t.seats.forEach((_, i) => decideInsurance(t, i, decideInsuranceAI(levels[i]!, t, i)));
      let guard = 0;
      while (t.phase === 'playing') {
        applyBJAction(t, decideBJ(levels[t.turn!.seat]!, t));
        if (++guard > 100) throw new Error('bucle');
      }
      expect(t.phase).toBe('settled');
      t.seats.forEach((s, i) => {
        expect(s.bankroll).toBe(ledger[i]! + seatRoundNet(s));
      });
      ledger = t.seats.map((s) => s.bankroll);
    }
  });
});

describe('Blackjack: zapato', () => {
  it('con 1 mazo y muchas divisiones nunca se agota el zapato (40,000 rondas con 5 asientos)', () => {
    const r = new SeededRng(31);
    const t = createBlackjack({ ...DEFAULT_RULES, decks: 1, maxHands: 4, resplitAces: true, penetration: 0.9 }, [0, 1, 2, 3, 4].map((i) => ({ id: `s${i}`, name: `S${i}`, isHuman: false, bankroll: 1e12 })), r);
    for (let round = 0; round < 40_000; round++) {
      startRound(t, [10, 10, 10, 10, 10], r);
      if (t.phase === 'insurance') t.seats.forEach((_, i) => decideInsurance(t, i, 0));
      while (t.phase === 'playing') {
        const l = getLegal(t);
        applyBJAction(t, l.split ? 'split' : l.hit && handTotal(t.seats[t.turn!.seat]!.hands[t.turn!.hand]!.cards).total < 17 ? 'hit' : 'stand');
      }
      expect(t.phase).toBe('settled');
    }
  });
});
