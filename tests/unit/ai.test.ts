import { describe, expect, it } from 'vitest';
import { SeededRng, randomInt } from '../../src/core/rng';
import { applyAction, createGame, getLegalActions, startHand } from '../../src/engine/poker/game';
import { getPlayerView } from '../../src/engine/poker/view';
import { decide, newMemory, bluffTarget, chooseOption, type PokerLevel } from '../../src/ai/poker/bots';
import { equityVsRanges, equityVsRandom } from '../../src/ai/poker/equity';
import { topRange, fullRange, removeDead, rangeWidth, boardTexture, drawOuts } from '../../src/ai/poker/ranges';
import { estimateRange, analyze, percentileWithin } from '../../src/ai/poker/analysis';
import { tendencies, observeHand, type ModelStore } from '../../src/ai/poker/opponentModel';
import { comboOf, NUM_COMBOS, COMBO_A, COMBO_B } from '../../src/ai/poker/combos';
import { duplicateHeadsUp } from '../../src/ai/poker/match';
import { evaluateHoleBoard } from '../../src/engine/poker/handEval';
import { cs } from './helpers';
import type { OptionEV } from '../../src/ai/poker/analysis';

const pointMass = (a: string): Float64Array => {
  const r = new Float64Array(NUM_COMBOS);
  const [x, y] = cs(a);
  r[comboOf(x!, y!)] = 1;
  return r;
};

describe('Equity Monte Carlo', () => {
  const rng = new SeededRng(4);
  it('AA vs KK ≈ 82%', () => {
    const eq = equityVsRanges(cs('As Ah'), [], [{ range: pointMass('Kd Kc'), pct: new Float64Array(NUM_COMBOS), responder: false }], 20000, rng).equity;
    expect(eq).toBeGreaterThan(0.8);
    expect(eq).toBeLessThan(0.84);
  });
  it('AKs vs QQ ≈ 46%', () => {
    const eq = equityVsRanges(cs('As Ks'), [], [{ range: pointMass('Qd Qc'), pct: new Float64Array(NUM_COMBOS), responder: false }], 20000, rng).equity;
    expect(eq).toBeGreaterThan(0.44);
    expect(eq).toBeLessThan(0.48);
  });
  it('AA contra una mano aleatoria ≈ 85%, contra 4 ≈ 56%', () => {
    expect(equityVsRandom(cs('As Ah'), [], 1, 20000, rng)).toBeCloseTo(0.852, 1);
    const e4 = equityVsRandom(cs('As Ah'), [], 4, 15000, rng);
    expect(e4).toBeGreaterThan(0.52);
    expect(e4).toBeLessThan(0.6);
  });
  it('en el river sin cartas por salir la equity es exacta contra un combo', () => {
    const eq = equityVsRanges(cs('Ah Kh'), cs('2h 7h 9h Jc Qd'), [{ range: pointMass('Ad Kd'), pct: new Float64Array(NUM_COMBOS), responder: false }], 500, rng).equity;
    expect(eq).toBe(1);
  });
  it('eqTop: contra la parte fuerte del rango la equity baja', () => {
    const board = cs('Ks 7d 2c');
    const r = topRange(0.5);
    removeDead(r, [...board, ...cs('Kh Qh')]);
    const strength = new Float64Array(NUM_COMBOS);
    for (let i = 0; i < NUM_COMBOS; i++) strength[i] = r[i]! > 0 ? evaluateHoleBoard(COMBO_A[i]!, COMBO_B[i]!, board) : 0;
    const pct = percentileWithin(r, strength);
    const res = equityVsRanges(cs('Kh Qh'), board, [{ range: r, pct, responder: true }], 6000, rng);
    expect(res.eqTop(0.2)).toBeLessThan(res.equity);
  });
});

describe('Rangos y textura', () => {
  it('topRange respeta el ancho', () => {
    expect(rangeWidth(topRange(0.1))).toBeCloseTo(0.1, 1);
    expect(rangeWidth(fullRange())).toBe(1);
  });
  it('detecta texturas', () => {
    expect(boardTexture(cs('Ks 7d 2c')).wetness).toBeLessThan(0.3);
    expect(boardTexture(cs('9h Th Jh')).wetness).toBeGreaterThan(0.6);
    expect(boardTexture(cs('8s 8d 3c')).paired).toBe(true);
  });
  it('cuenta outs de proyectos', () => {
    const b = cs('9h Th 2c');
    expect(drawOuts(cs('Ah 3h')[0]!, cs('Ah 3h')[1]!, b, evaluateHoleBoard(cs('Ah')[0]!, cs('3h')[0]!, b))).toBeGreaterThanOrEqual(9);
    const b2 = cs('9c Td 2h');
    const [j, q] = cs('Jc Qs');
    expect(drawOuts(j!, q!, b2, evaluateHoleBoard(j!, q!, b2))).toBeGreaterThanOrEqual(8);
  });
});

function scriptedGame(actions: (g: ReturnType<typeof createGame>) => void) {
  const g = createGame({ smallBlind: 50, bigBlind: 100, blindIncreaseEvery: 0 }, [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isHuman: false, stack: 10000 })), 0);
  startHand(g, new SeededRng(77));
  actions(g);
  return g;
}

describe('Estimación de rangos del rival', () => {
  it('una 3-bet estrecha el rango mucho más que un call', () => {
    const g = scriptedGame((g) => {
      applyAction(g, { type: 'raise', to: 300 }); // p0 BTN abre
      applyAction(g, { type: 'raise', to: 1000 }); // p1 SB 3-bet
    });
    const v = getPlayerView(g, 2);
    const t = tendencies(undefined);
    const r3 = estimateRange(v, v.players[1]!, t);
    const rOpen = estimateRange(v, v.players[0]!, t);
    expect(rangeWidth(r3)).toBeLessThan(0.12);
    expect(rangeWidth(rOpen)).toBeGreaterThan(rangeWidth(r3));
  });
});

describe('Modelo de rivales (sólo información pública)', () => {
  it('cuenta VPIP, PFR y retiradas', () => {
    const store: ModelStore = {};
    const g = scriptedGame((g) => {
      applyAction(g, { type: 'raise', to: 300 }); // p0
      applyAction(g, { type: 'call' }); // p1
      applyAction(g, { type: 'fold' }); // p2
      applyAction(g, { type: 'check' });
      applyAction(g, { type: 'raise', to: 300 }); // p0 apuesta en el flop
      applyAction(g, { type: 'fold' }); // p1 se retira
    });
    observeHand(store, g.log, g.players.map((p) => p.id));
    expect(store.p0!.vpip).toBe(1);
    expect(store.p0!.pfr).toBe(1);
    expect(store.p1!.vpip).toBe(1);
    expect(store.p1!.pfr).toBe(0);
    expect(store.p2!.vpip).toBe(0);
    expect(store.p1!.facedBet).toBe(1);
    expect(store.p1!.foldToBet).toBe(1);
    expect(store.p2!.preFacedRaise).toBe(1);
    expect(store.p2!.preFoldToRaise).toBe(1);
    const t = tendencies(store.p1);
    expect(t.foldToBet).toBeGreaterThan(tendencies(undefined).foldToBet);
  });
});

describe('Bots: siempre acciones legales y sin ver cartas ocultas', () => {
  it('ningún nivel produce acciones ilegales en 400 manos aleatorias de 2 a 6 jugadores', () => {
    const r = new SeededRng(2024);
    const levels: PokerLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
    let decisions = 0;
    for (let t = 0; t < 40; t++) {
      const n = 2 + (t % 5);
      const g = createGame({ smallBlind: 10, bigBlind: 20, blindIncreaseEvery: 0 }, Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isHuman: false, stack: 200 + randomInt(r, 3000) })), 0);
      const models: ModelStore = {};
      const mems = Array.from({ length: n }, newMemory);
      for (let h = 0; h < 10; h++) {
        startHand(g, r);
        if (g.phase === 'gameOver') break;
        while (g.phase === 'betting') {
          const seat = g.toAct!;
          const view = getPlayerView(g, seat);
          // La vista nunca contiene cartas de rivales.
          expect(view.players.filter((p) => p.hole && p.seat !== seat).length).toBe(0);
          const a = decide({ view, level: levels[(seat + t) % 4]!, models, memory: mems[seat]!, rng: r, iterations: 80 });
          const l = getLegalActions(g);
          if (a.type === 'fold') expect(l.canFold).toBe(true);
          if (a.type === 'check') expect(l.canCheck).toBe(true);
          if (a.type === 'call') expect(l.canCall).toBe(true);
          if (a.type === 'raise') {
            expect(l.canRaise).toBe(true);
            expect(a.to).toBeGreaterThanOrEqual(l.minRaiseTo);
            expect(a.to).toBeLessThanOrEqual(l.maxRaiseTo);
          }
          applyAction(g, a);
          decisions++;
        }
        observeHand(models, g.log, g.players.map((p) => p.id));
      }
    }
    expect(decisions).toBeGreaterThan(500);
  });

  it('el Experto decide igual con la misma vista aunque cambien las cartas ocultas de los rivales', () => {
    const g = scriptedGame((g) => applyAction(g, { type: 'raise', to: 300 }));
    const v1 = getPlayerView(g, 1);
    g.players[0]!.hole = cs('2c 3d');
    g.players[2]!.hole = cs('7h 8h');
    g.deck = g.deck.slice().reverse();
    const v2 = getPlayerView(g, 1);
    expect(v2).toEqual(v1);
    const a1 = decide({ view: v1, level: 'expert', models: {}, memory: newMemory(), rng: new SeededRng(5), iterations: 200 });
    const a2 = decide({ view: v2, level: 'expert', models: {}, memory: newMemory(), rng: new SeededRng(5), iterations: 200 });
    expect(a2).toEqual(a1);
  });
});

describe('Mezcla estratégica y faroles controlados', () => {
  const opt = (ev: number, kind: OptionEV['kind'] = 'check'): OptionEV => ({ kind, action: { type: 'check' }, to: 0, added: 0, sizeFrac: 0, ev, foldProb: 0, eqWhenCalled: 0, isBluff: false });
  it('con temperatura baja elige casi siempre la mejor opción; con alta, mezcla', () => {
    const r = new SeededRng(1);
    const opts = [opt(0), opt(10), opt(9.5)];
    let best = 0;
    for (let i = 0; i < 1000; i++) if (chooseOption(opts, 0.05, r) === opts[1]) best++;
    expect(best).toBeGreaterThan(990);
    let mixed = 0;
    for (let i = 0; i < 1000; i++) if (chooseOption(opts, 2, r) === opts[2]) mixed++;
    expect(mixed).toBeGreaterThan(200);
  });
  it('el objetivo de faroles crece con el tamaño de apuesta y es mayor en calles tempranas', () => {
    expect(bluffTarget(1, 'river')).toBeCloseTo(1 / 3, 2);
    expect(bluffTarget(0.5, 'river')).toBeCloseTo(0.25, 2);
    expect(bluffTarget(0.5, 'flop')).toBeGreaterThan(bluffTarget(0.5, 'river'));
  });
  it('el análisis recomienda subir AA y retirarse con 72o en UTG', () => {
    const mk = (hole: string) => {
      const g = createGame({ smallBlind: 50, bigBlind: 100, blindIncreaseEvery: 0 }, Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 3, stack: 10000 })), 0);
      startHand(g, new SeededRng(3));
      // UTG = asiento 3 (botón 0, SB 1, BB 2).
      g.players[3]!.hole = cs(hole);
      return analyze(getPlayerView(g, 3), { iterations: 400, rng: new SeededRng(9), models: {} });
    };
    expect(['raise', 'bet']).toContain(mk('As Ah').best.kind);
    expect(mk('7c 2d').best.kind).toBe('fold');
  });
});

describe('Torneo automático (muestra determinista)', () => {
  it('el Experto vence de forma medible a Principiante, Intermedio y Avanzado', () => {
    for (const lv of ['beginner', 'intermediate', 'advanced'] as PokerLevel[]) {
      const r = duplicateHeadsUp({ id: 'E', level: 'expert' }, { id: 'X', level: lv }, 700, 4242, 150);
      expect(r.bb100, lv).toBeGreaterThan(0);
      expect(r.ciLow, lv).toBeGreaterThan(0);
    }
  });
});
