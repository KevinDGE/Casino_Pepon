import { describe, expect, it } from 'vitest';
import { SeededRng, randomInt } from '../../src/core/rng';
import { getLegalActions } from '../../src/engine/poker/game';
import { generateKey, type SraKey } from '../../src/mp/sra';
import { fromAction, myCryptoStep, nextLineup, replayHand, type HostInfo, type Lineup, type PlayerDoc } from '../../src/mp/protocol';

const HOST: HostInfo = { tableId: 't1', name: 'Mesa', sb: 10, bb: 20, buyIn: 1000, maxSeats: 6, createdAt: 0 };

function newDoc(seat: number): PlayerDoc {
  return { v: 1, table: 't1', seat, joinedAt: seat, alive: 0, ready: 1, h: null };
}

/** Juega una mano completa entre los ids dados; devuelve las fichas finales. */
function playHand(lineup: Lineup, docs: Record<string, PlayerDoc>, keys: Record<string, SraKey>, rng: SeededRng, tamper?: (uid: string, docs: Record<string, PlayerDoc>) => void, passive = false) {
  const host = docs[lineup.players[0]!]!;
  for (const uid of lineup.players) docs[uid]!.h = { n: lineup.n, acts: [] };
  for (let step = 0; step < 400; step++) {
    // Cada jugador mira su propia reconstrucción y actúa si le toca.
    let progressed = false;
    for (const uid of lineup.players) {
      const r = replayHand(lineup, docs, host, uid, keys[uid]!);
      if (r.pending.kind === 'done' || r.pending.kind === 'error' || r.pending.kind === 'void') return r;
      // Privacidad: en mi reconstrucción, las cartas de los demás siguen ocultas antes del showdown.
      if (r.state && r.pending.kind !== 'showdown') {
        r.state.players.forEach((p, s) => { if (s !== r.mySeat) expect(p.hole.every((c) => c === -1)).toBe(true); });
      }
      const patch = myCryptoStep(r, uid, keys[uid]!, rng);
      if (patch) {
        const h = docs[uid]!.h!;
        docs[uid]!.h = { ...h, ...patch, rv: { ...(h.rv ?? {}), ...(patch.rv ?? {}) } };
        tamper?.(uid, docs);
        progressed = true;
        continue;
      }
      if (r.pending.kind === 'act' && r.pending.who === uid) {
        const g = r.state!;
        const l = getLegalActions(g, g.toAct!);
        const roll = randomInt(rng, 100);
        const action = passive ? (l.canCheck ? { type: 'check' as const } : { type: 'call' as const }) : l.canRaise && roll < 15 ? { type: 'raise' as const, to: l.minRaiseTo } : l.canCheck ? { type: 'check' as const } : roll < 25 ? { type: 'fold' as const } : { type: 'call' as const };
        docs[uid]!.h!.acts.push(fromAction(action, r.pending.seq));
        progressed = true;
      }
    }
    if (!progressed) throw new Error('El protocolo se atoró');
  }
  throw new Error('Mano sin fin');
}

describe('Multijugador: póker mental completo', () => {
  it('3 jugadores juegan 6 manos: fichas conservadas, cada quien sólo ve sus cartas, showdown consistente', () => {
    const rng = new SeededRng(11);
    const ids = ['u_a', 'u_b', 'u_c'];
    const docs: Record<string, PlayerDoc> = Object.fromEntries(ids.map((u, i) => [u, newDoc(i)]));
    let lineup = nextLineup(null, null, ids.map((uid, i) => ({ uid, seat: i, ready: 1 })), HOST, 1)!;
    expect(lineup.stacks).toEqual([1000, 1000, 1000]);
    for (let hand = 1; hand <= 6; hand++) {
      const keys = Object.fromEntries(ids.map((u) => [u, generateKey(rng)]));
      const r = playHand(lineup, docs, keys, rng);
      expect(r.pending.kind).toBe('done');
      const stacks = r.state!.players.map((p) => p.stack);
      expect(stacks.reduce((a, b) => a + b, 0)).toBe(lineup.stacks.reduce((a, b) => a + b, 0));
      // Todas las reconstrucciones coinciden.
      for (const uid of ids) {
        const rr = replayHand(lineup, docs, docs[lineup.players[0]!]!, uid, keys[uid]!);
        if (lineup.players.includes(uid)) expect(rr.state!.players.map((p) => p.stack)).toEqual(stacks);
      }
      // Las cartas que cada quien ve son distintas de las del tablero.
      const board = r.state!.board;
      for (const uid of lineup.players) {
        const mine = replayHand(lineup, docs, docs[lineup.players[0]!]!, uid, keys[uid]!).myHole!;
        expect(mine.length).toBe(2);
        for (const c of mine) expect(board.includes(c)).toBe(false);
      }
      const next = nextLineup(lineup, stacks, lineup.players.map((uid, i) => ({ uid, seat: i, ready: hand + 1 })), HOST, hand + 1);
      if (!next) break;
      expect(next.players[next.button]).not.toBe(lineup.players[lineup.button]);
      lineup = next;
    }
  });

  it('detecta un revelado manipulado y lo reporta como error', () => {
    const rng = new SeededRng(3);
    const ids = ['u_a', 'u_b'];
    const docs: Record<string, PlayerDoc> = Object.fromEntries(ids.map((u, i) => [u, newDoc(i)]));
    const lineup = nextLineup(null, null, ids.map((uid, i) => ({ uid, seat: i, ready: 1 })), HOST, 1)!;
    const keys = Object.fromEntries(ids.map((u) => [u, generateKey(rng)]));
    let cheated = false;
    const r = playHand(lineup, docs, keys, rng, (uid, d) => {
      const rv = d[uid]!.h!.rv?.flop;
      if (!cheated && rv && uid === 'u_b') {
        // u_b sustituye una carta del flop por un valor inventado.
        rv[0] = rv[1]!;
        cheated = true;
      }
    }, true);
    expect(cheated).toBe(true);
    expect(r.pending.kind).toBe('error');
  });

  it('una mano anulada por quien hospeda no mueve fichas', () => {
    const ids = ['u_a', 'u_b'];
    const docs: Record<string, PlayerDoc> = Object.fromEntries(ids.map((u, i) => [u, newDoc(i)]));
    const lineup = nextLineup(null, null, ids.map((uid, i) => ({ uid, seat: i, ready: 1 })), HOST, 1)!;
    docs.u_a!.voided = [1];
    expect(replayHand(lineup, docs, docs.u_a!, 'u_a', null).pending.kind).toBe('void');
  });

  it('la alineación conserva fichas, agrega nuevos con el buy-in y saca a quien se quedó sin fichas', () => {
    const prev: Lineup = { n: 3, players: ['a', 'b', 'c'], stacks: [500, 500, 500], button: 2, sb: 10, bb: 20 };
    const next = nextLineup(prev, [0, 900, 600], [{ uid: 'a', seat: 0, ready: 4 }, { uid: 'b', seat: 1, ready: 4 }, { uid: 'c', seat: 2, ready: 4 }, { uid: 'd', seat: 3, ready: 4 }], HOST, 4)!;
    expect(next.players).toEqual(['b', 'c', 'd']);
    expect(next.stacks).toEqual([900, 600, 1000]);
  });
});
