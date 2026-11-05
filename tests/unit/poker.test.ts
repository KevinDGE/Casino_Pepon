import { describe, expect, it } from 'vitest';
import {
  applyAction, buildPots, createGame, getLegalActions, potTotal, startHand, positionName, IllegalActionError,
} from '../../src/engine/poker/game';
import type { PokerState } from '../../src/engine/poker/types';
import { getPlayerView } from '../../src/engine/poker/view';
import { SeededRng, randomInt } from '../../src/core/rng';
import { riggedDeck } from './helpers';

const cfg = { smallBlind: 5, bigBlind: 10, blindIncreaseEvery: 0 };
const rng = new SeededRng(123);

function game(stacks: number[], button = 0, config = cfg): PokerState {
  return createGame(
    config,
    stacks.map((s, i) => ({ id: `p${i}`, name: `P${i}`, isHuman: i === 0, stack: s })),
    button,
  );
}

const total = (s: PokerState) => s.players.reduce((a, p) => a + p.stack, 0) + (s.phase === 'betting' ? potTotal(s) : 0);

describe('Póker: ciegas y orden de acción', () => {
  it('3 jugadores: SB y BB a la izquierda del botón, UTG habla primero', () => {
    const g = game([1000, 1000, 1000]);
    startHand(g, rng);
    expect(g.button).toBe(0);
    expect(g.sbSeat).toBe(1);
    expect(g.bbSeat).toBe(2);
    expect(g.players[1]!.bet).toBe(5);
    expect(g.players[2]!.bet).toBe(10);
    expect(g.toAct).toBe(0);
    expect(g.currentBet).toBe(10);
    expect(g.players.every((p) => p.hole.length === 2)).toBe(true);
    expect(positionName(g, 0)).toBe('BTN');
  });

  it('mano a mano: el botón pone la SB, habla primero preflop y último postflop', () => {
    const g = game([1000, 1000]);
    startHand(g, rng);
    expect(g.sbSeat).toBe(0);
    expect(g.bbSeat).toBe(1);
    expect(g.toAct).toBe(0);
    applyAction(g, { type: 'call' });
    expect(g.toAct).toBe(1);
    applyAction(g, { type: 'check' });
    expect(g.street).toBe('flop');
    expect(g.board.length).toBe(3);
    expect(g.toAct).toBe(1);
  });

  it('el botón rota entre manos', () => {
    const g = game([1000, 1000, 1000]);
    startHand(g, rng);
    applyAction(g, { type: 'fold' });
    applyAction(g, { type: 'fold' });
    expect(g.phase).toBe('handOver');
    startHand(g, rng);
    expect(g.button).toBe(1);
    expect(g.sbSeat).toBe(2);
    expect(g.bbSeat).toBe(0);
  });

  it('la BB tiene opción de subir si todos igualan', () => {
    const g = game([1000, 1000, 1000]);
    startHand(g, rng);
    applyAction(g, { type: 'call' });
    applyAction(g, { type: 'call' });
    expect(g.toAct).toBe(2);
    const l = getLegalActions(g);
    expect(l.canCheck).toBe(true);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(20);
  });

  it('BB corta: los demás deben igualar la ciega completa', () => {
    const g = game([1000, 1000, 4]);
    startHand(g, rng);
    expect(g.players[2]!.allIn).toBe(true);
    expect(g.players[2]!.bet).toBe(4);
    expect(getLegalActions(g).toCall).toBe(10);
  });

  it('las ciegas suben según la configuración', () => {
    const g = game([10000, 10000], 0, { smallBlind: 5, bigBlind: 10, blindIncreaseEvery: 2 });
    for (let h = 1; h <= 5; h++) {
      startHand(g, rng);
      const expected = 10 * 2 ** Math.floor((h - 1) / 2);
      expect(g.bigBlind).toBe(expected);
      applyAction(g, { type: 'fold' });
    }
  });
});

describe('Póker: subidas', () => {
  it('la subida mínima es igual a la última subida completa', () => {
    const g = game([1000, 1000, 1000]);
    startHand(g, rng);
    applyAction(g, { type: 'raise', to: 30 });
    expect(getLegalActions(g).minRaiseTo).toBe(50);
    expect(() => applyAction(g, { type: 'raise', to: 40 })).toThrow(IllegalActionError);
    applyAction(g, { type: 'raise', to: 50 });
    expect(getLegalActions(g).minRaiseTo).toBe(70);
  });

  it('no se puede pasar con apuesta pendiente ni retirarse sin apuesta', () => {
    const g = game([1000, 1000]);
    startHand(g, rng);
    expect(() => applyAction(g, { type: 'check' })).toThrow(IllegalActionError);
    applyAction(g, { type: 'call' });
    expect(() => applyAction(g, { type: 'fold' })).toThrow(IllegalActionError);
  });

  it('un all-in incompleto NO reabre la acción a quien ya habló', () => {
    const g = game([1000, 1000, 45]);
    startHand(g, rng);
    applyAction(g, { type: 'raise', to: 30 }); // asiento 0
    applyAction(g, { type: 'call' }); // asiento 1 (SB)
    expect(g.toAct).toBe(2);
    applyAction(g, { type: 'raise', to: 45 }); // BB all-in, incremento 15 < 20
    expect(g.players[2]!.allIn).toBe(true);
    expect(g.toAct).toBe(0);
    const l = getLegalActions(g);
    expect(l.canRaise).toBe(false);
    expect(l.canCall).toBe(true);
    expect(l.toCall).toBe(15);
    applyAction(g, { type: 'call' });
    expect(getLegalActions(g).canRaise).toBe(false);
    applyAction(g, { type: 'call' });
    expect(g.street).toBe('flop');
  });

  it('un all-in completo SÍ reabre la acción', () => {
    const g = game([1000, 1000, 60]);
    startHand(g, rng);
    applyAction(g, { type: 'raise', to: 30 });
    applyAction(g, { type: 'call' });
    applyAction(g, { type: 'raise', to: 60 }); // incremento 30 ≥ 20
    expect(getLegalActions(g).canRaise).toBe(true);
    expect(getLegalActions(g).minRaiseTo).toBe(90);
  });

  it('con un stack menor a la subida mínima se puede ir all-in', () => {
    const g = game([25, 1000, 1000]);
    startHand(g, rng);
    const l = getLegalActions(g);
    expect(l.minRaiseTo).toBe(20);
    expect(l.maxRaiseTo).toBe(25);
    applyAction(g, { type: 'raise', to: 25 });
    expect(g.players[0]!.allIn).toBe(true);
  });
});

describe('Póker: botes, all-ins y showdown', () => {
  it('construye botes secundarios con tres all-ins distintos y paga a cada ganador', () => {
    const g = game([100, 300, 500]);
    // Orden de reparto: asiento 1, 2, 0.
    startHand(g, rng, riggedDeck(['Kh Kd', 'Qh Qd', 'Ah Ad'], '2c 7d 9h Js 3s'));
    applyAction(g, { type: 'raise', to: 100 }); // 0 all-in
    applyAction(g, { type: 'raise', to: 300 }); // 1 all-in
    applyAction(g, { type: 'call' }); // 2 iguala 300
    expect(g.phase).toBe('handOver');
    expect(g.board.length).toBe(5);
    const r = g.result!;
    expect(r.showdown).toBe(true);
    expect(r.pots.map((p) => p.amount)).toEqual([300, 400]);
    expect(r.pots[0]!.winners).toEqual([0]);
    expect(r.pots[1]!.winners).toEqual([1]);
    expect(g.players.map((p) => p.stack)).toEqual([300, 400, 200]);
    expect(r.net).toEqual({ 0: 200, 1: 100, 2: -300 });
  });

  it('el jugador corto gana sólo el bote principal; el secundario va al siguiente mejor', () => {
    const g = game([100, 300, 500]);
    startHand(g, rng, riggedDeck(['Qh Qd', 'Kh Kd', 'Ah Ad'], '2c 7d 9h Js 3s'));
    applyAction(g, { type: 'raise', to: 100 });
    applyAction(g, { type: 'raise', to: 300 });
    applyAction(g, { type: 'call' });
    expect(g.players.map((p) => p.stack)).toEqual([300, 0, 600]);
    expect(g.players[1]!.out).toBe(true);
  });

  it('empate: divide el bote y la ficha impar va al primero a la izquierda del botón', () => {
    const g = game([1000, 1000, 1000]);
    startHand(g, rng, riggedDeck(['2c 3d', '4c 5d', '6c 7d'], 'As Ks Qs Js Ts'));
    applyAction(g, { type: 'call' }); // 0
    applyAction(g, { type: 'fold' }); // 1 (SB) pierde 5
    applyAction(g, { type: 'check' }); // 2
    for (let i = 0; i < 6; i++) applyAction(g, { type: 'check' });
    expect(g.phase).toBe('handOver');
    const r = g.result!;
    expect(r.pots[0]!.amount).toBe(25);
    expect(r.pots[0]!.winners).toEqual([2, 0]);
    expect(r.pots[0]!.shares).toEqual([13, 12]);
    expect(r.net).toEqual({ 0: 2, 1: -5, 2: 3 });
  });

  it('empate con kicker en el tablero: se reparte; kicker propio desempata', () => {
    const g = game([1000, 1000]);
    // HU: reparto asiento 1, luego 0.
    startHand(g, rng, riggedDeck(['Ah 2d', 'Ac 3d'], 'Ad Kc Qh 9s 8c'));
    applyAction(g, { type: 'call' });
    applyAction(g, { type: 'check' });
    for (let i = 0; i < 6; i++) applyAction(g, { type: 'check' });
    expect(g.result!.pots[0]!.winners.length).toBe(2);
    const g2 = game([1000, 1000]);
    startHand(g2, rng, riggedDeck(['Ah Jd', 'Ac Td'], 'Ad Kc 4h 3s 2c'));
    applyAction(g2, { type: 'call' });
    applyAction(g2, { type: 'check' });
    for (let i = 0; i < 6; i++) applyAction(g2, { type: 'check' });
    expect(g2.result!.pots[0]!.winners).toEqual([1]);
  });

  it('devuelve la apuesta no igualada', () => {
    const g = game([1000, 1000]);
    startHand(g, rng);
    applyAction(g, { type: 'raise', to: 100 });
    applyAction(g, { type: 'fold' });
    expect(g.log.some((e) => e.t === 'refund' && e.seat === 0 && e.amount === 90)).toBe(true);
    expect(g.players[0]!.stack).toBe(1010);
    expect(g.result!.showdown).toBe(false);
  });

  it('devuelve el exceso cuando un all-in rival es menor', () => {
    const g = game([1000, 200]);
    startHand(g, rng, riggedDeck(['Ah Ad', 'Kh Kd'], '2c 7d 9h Js 3s'));
    applyAction(g, { type: 'raise', to: 1000 });
    applyAction(g, { type: 'call' }); // 200 all-in
    expect(g.log.some((e) => e.t === 'refund' && e.seat === 0 && e.amount === 800)).toBe(true);
    expect(g.players[1]!.stack).toBe(400);
    expect(g.players[0]!.stack).toBe(800);
  });

  it('all-in preflop reparte el tablero completo sin más apuestas', () => {
    const g = game([500, 500]);
    startHand(g, rng);
    applyAction(g, { type: 'raise', to: 500 });
    applyAction(g, { type: 'call' });
    expect(g.board.length).toBe(5);
    expect(g.phase === 'handOver' || g.phase === 'gameOver').toBe(true);
    expect(total(g)).toBe(1000);
  });

  it('elimina al jugador sin fichas y termina el juego', () => {
    const g = game([1000, 50]);
    startHand(g, rng, riggedDeck(['2h 7d', 'Ah Ad'], 'As 7c 9h Js 3s'));
    // Asiento 1 recibe 2h7d (reparto empieza a la izquierda del botón 0).
    applyAction(g, { type: 'raise', to: 1000 });
    applyAction(g, { type: 'call' });
    expect(g.players[1]!.out).toBe(true);
    expect(g.phase).toBe('gameOver');
    startHand(g, rng);
    expect(g.phase).toBe('gameOver');
  });

  it('buildPots ignora aportes de jugadores retirados para la elegibilidad', () => {
    const pots = buildPots([
      { seat: 0, contributed: 50, folded: true, out: false },
      { seat: 1, contributed: 100, folded: false, out: false },
      { seat: 2, contributed: 100, folded: false, out: false },
    ] as never);
    expect(pots).toEqual([{ amount: 250, eligible: [1, 2] }]);
  });
});

describe('Póker: privacidad de la vista de jugador', () => {
  it('la vista no contiene el mazo ni cartas ocultas de rivales', () => {
    const g = game([1000, 1000, 1000]);
    startHand(g, rng);
    const v = getPlayerView(g, 1);
    expect(v.hole.length).toBe(2);
    expect(v.players.filter((p) => p.hole !== null).map((p) => p.seat)).toEqual([1]);
    const json = JSON.stringify(v);
    expect(json).not.toContain('deck');
    expect('deck' in v).toBe(false);
  });

  it('tras el showdown se ven las cartas mostradas', () => {
    const g = game([500, 500]);
    startHand(g, rng);
    applyAction(g, { type: 'raise', to: 500 });
    applyAction(g, { type: 'call' });
    const v = getPlayerView(g, 0);
    expect(v.players.every((p) => p.hole !== null)).toBe(true);
  });
});

describe('Póker: invariantes con juego aleatorio', () => {
  it('conserva las fichas y respeta reglas en miles de manos aleatorias (2 a 6 jugadores)', () => {
    const r = new SeededRng(99);
    let hands = 0;
    for (let t = 0; t < 400; t++) {
      const n = 2 + (t % 5);
      const stacks = Array.from({ length: n }, () => 50 + randomInt(r, 1500));
      const g = game(stacks, t % n);
      const chips = stacks.reduce((a, b) => a + b, 0);
      for (let h = 0; h < 50; h++) {
        startHand(g, r);
        if (g.phase === 'gameOver') break;
        hands++;
        let guard = 0;
        while (g.phase === 'betting') {
          const l = getLegalActions(g);
          const roll = randomInt(r, 100);
          if (l.canRaise && roll < 10) {
            const to = l.minRaiseTo + randomInt(r, l.maxRaiseTo - l.minRaiseTo + 1);
            applyAction(g, { type: 'raise', to });
          } else if (l.canFold && roll < 45) applyAction(g, { type: 'fold' });
          else if (l.canCall) applyAction(g, { type: 'call' });
          else applyAction(g, { type: 'check' });
          expect(total(g)).toBe(chips);
          expect(g.players.every((p) => p.stack >= 0)).toBe(true);
          if (++guard > 500) throw new Error('bucle infinito');
        }
        expect(g.players.reduce((a, p) => a + p.stack, 0)).toBe(chips);
        const net = Object.values(g.result!.net).reduce((a, b) => a + b, 0);
        expect(net).toBe(0);
        const potSum = g.result!.pots.reduce((a, p) => a + p.amount, 0);
        const shareSum = g.result!.pots.reduce((a, p) => a + p.shares.reduce((x, y) => x + y, 0), 0);
        expect(shareSum).toBe(potSum);
      }
    }
    expect(hands).toBeGreaterThan(2000);
  });
});
