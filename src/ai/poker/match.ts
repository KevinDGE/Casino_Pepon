/**
 * Arnés de partidas automáticas entre bots (torneos de validación).
 * Los bots sólo reciben PokerView. El modelo de rivales se alimenta con el
 * registro público de cada mano (sin cartas ocultas salvo showdown).
 */
import { SeededRng, shuffleInPlace } from '../../core/rng';
import { fullDeck } from '../../core/cards';
import { applyAction, createGame, startHand } from '../../engine/poker/game';
import type { HandEvent, PokerState } from '../../engine/poker/types';
import { getPlayerView } from '../../engine/poker/view';
import { decide, newMemory, type BotMemory, type PokerLevel } from './bots';
import { observeHand, type ModelStore } from './opponentModel';
import type { StyleParams } from './analysis';

export interface BotSpec {
  id: string;
  level: PokerLevel;
  style?: StyleParams;
}

/** Elimina del registro las cartas que no se mostraron (sólo deja información pública). */
export function publicLog(log: readonly HandEvent[]): HandEvent[] {
  return log.map((e) => e);
}

export interface HandOutcome {
  net: number[];
}

export class BotTable {
  models: Record<string, ModelStore> = {};
  memory: Record<string, BotMemory> = {};
  rngs: Record<string, SeededRng> = {};
  constructor(public bots: BotSpec[], seed: number, public iterations = 400) {
    bots.forEach((b, i) => {
      this.models[b.id] = {};
      this.memory[b.id] = newMemory();
      this.rngs[b.id] = new SeededRng(seed * 31 + i * 7919 + 1);
    });
  }

  /**
   * Juega una mano "de cash" con stacks iguales. `order[k]` = índice de bot
   * sentado en el asiento k. Devuelve el neto por índice de bot.
   */
  playHand(order: number[], deck: number[], stackBB: number, bb: number, button: number): number[] {
    const seats = order.map((bi) => ({ id: this.bots[bi]!.id, name: this.bots[bi]!.id, isHuman: false, stack: stackBB * bb }));
    const g: PokerState = createGame({ smallBlind: bb / 2, bigBlind: bb, blindIncreaseEvery: 0 }, seats, button);
    const dummy = new SeededRng(1);
    startHand(g, dummy, deck);
    let guard = 0;
    while (g.phase === 'betting') {
      const seat = g.toAct!;
      const bot = this.bots[order[seat]!]!;
      const view = getPlayerView(g, seat);
      const a = decide({
        view, level: bot.level, style: bot.style, models: this.models[bot.id]!, memory: this.memory[bot.id]!,
        rng: this.rngs[bot.id]!, iterations: this.iterations,
      });
      applyAction(g, a);
      if (++guard > 400) throw new Error('Mano sin fin');
    }
    const ids = g.players.map((p) => p.id);
    for (const b of this.bots) observeHand(this.models[b.id]!, g.log, ids);
    const net = new Array<number>(this.bots.length).fill(0);
    order.forEach((bi, seat) => { net[bi] = g.result!.net[seat] ?? 0; });
    return net;
  }
}

export interface DuplicateResult {
  hands: number;
  /** Ganancia del bot A en ciegas grandes por 100 manos. */
  bb100: number;
  /** Error estándar del bb/100. */
  se: number;
  ciLow: number;
  ciHigh: number;
}

/**
 * Mano a mano duplicado: cada mazo se juega dos veces con las cartas
 * intercambiadas entre los dos bots. Reduce muchísimo la varianza.
 */
export interface RawStats {
  n: number;
  sum: number;
  sumSq: number;
  handsPerSample: number;
}

export function rawToResult(r: RawStats): DuplicateResult {
  const mean = r.sum / r.n;
  const variance = (r.sumSq - r.n * mean * mean) / Math.max(1, r.n - 1);
  const perHand = mean / r.handsPerSample;
  const se = Math.sqrt(Math.max(0, variance) / r.n) / r.handsPerSample;
  return { hands: r.n * r.handsPerSample, bb100: perHand * 100, se: se * 100, ciLow: (perHand - 1.96 * se) * 100, ciHigh: (perHand + 1.96 * se) * 100 };
}

export function mergeRaw(rs: RawStats[]): RawStats {
  return rs.reduce((a, b) => ({ n: a.n + b.n, sum: a.sum + b.sum, sumSq: a.sumSq + b.sumSq, handsPerSample: b.handsPerSample }), { n: 0, sum: 0, sumSq: 0, handsPerSample: 2 });
}

export function duplicateHeadsUpRaw(a: BotSpec, b: BotSpec, pairs: number, seed: number, iterations = 400, stackBB = 100): RawStats {
  const table = new BotTable([a, b], seed, iterations);
  const deckRng = new SeededRng(seed);
  const bb = 100;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < pairs; i++) {
    const deck = shuffleInPlace(fullDeck(), deckRng);
    const button = i % 2;
    const n1 = table.playHand([0, 1], deck, stackBB, bb, button);
    const n2 = table.playHand([1, 0], deck, stackBB, bb, button);
    const x = (n1[0]! + n2[0]!) / bb;
    sum += x;
    sumSq += x * x;
  }
  return { n: pairs, sum, sumSq, handsPerSample: 2 };
}

export function duplicateHeadsUp(a: BotSpec, b: BotSpec, pairs: number, seed: number, iterations = 400, stackBB = 100): DuplicateResult {
  const table = new BotTable([a, b], seed, iterations);
  const deckRng = new SeededRng(seed);
  const bb = 100;
  const samples: number[] = [];
  for (let i = 0; i < pairs; i++) {
    const deck = shuffleInPlace(fullDeck(), deckRng);
    const button = i % 2;
    // Mano 1: A en asiento 0. Mano 2: B en asiento 0 (recibe las cartas que tuvo A).
    const n1 = table.playHand([0, 1], deck, stackBB, bb, button);
    const n2 = table.playHand([1, 0], deck, stackBB, bb, button);
    samples.push((n1[0]! + n2[0]!) / bb); // en BB, por par (2 manos)
  }
  return summarize(samples, 2);
}

export function summarize(samples: number[], handsPerSample: number): DuplicateResult {
  const n = samples.length;
  const mean = samples.reduce((x, y) => x + y, 0) / n;
  const variance = samples.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, n - 1);
  const perHand = mean / handsPerSample;
  const se = Math.sqrt(variance / n) / handsPerSample;
  return {
    hands: n * handsPerSample,
    bb100: perHand * 100,
    se: se * 100,
    ciLow: (perHand - 1.96 * se) * 100,
    ciHigh: (perHand + 1.96 * se) * 100,
  };
}

/** Mesa de hasta 6 bots con rotación de asientos; bb/100 por bot. */
export function ringGame(bots: BotSpec[], hands: number, seed: number, iterations = 300, stackBB = 100): { id: string; level: PokerLevel; bb100: number; se: number }[] {
  const table = new BotTable(bots, seed, iterations);
  const deckRng = new SeededRng(seed ^ 0x5bd1e995);
  const n = bots.length;
  const perBot: number[][] = bots.map(() => []);
  for (let h = 0; h < hands; h++) {
    const shift = h % n;
    const order = bots.map((_, k) => (k + shift) % n);
    const deck = shuffleInPlace(fullDeck(), deckRng);
    const net = table.playHand(order, deck, stackBB, 100, Math.floor(h / n) % n);
    net.forEach((x, i) => perBot[i]!.push(x / 100));
  }
  return bots.map((b, i) => {
    const s = summarize(perBot[i]!, 1);
    return { id: b.id, level: b.level, bb100: s.bb100, se: s.se };
  });
}

/** Freezeout mano a mano: juega hasta que uno quede sin fichas. Devuelve índice ganador. */
export function freezeout(a: BotSpec, b: BotSpec, seed: number, iterations = 300, stackBB = 50): { winner: 0 | 1; hands: number } {
  const table = new BotTable([a, b], seed, iterations);
  const deckRng = new SeededRng(seed ^ 0x2545f491);
  const g = createGame({ smallBlind: 50, bigBlind: 100, blindIncreaseEvery: 40 },
    [{ id: a.id, name: a.id, isHuman: false, stack: stackBB * 100 }, { id: b.id, name: b.id, isHuman: false, stack: stackBB * 100 }],
    seed % 2);
  let hands = 0;
  while (hands < 2000) {
    startHand(g, deckRng);
    if (g.phase === 'gameOver') break;
    hands++;
    let guard = 0;
    while (g.phase === 'betting') {
      const seat = g.toAct!;
      const bot = table.bots[seat]!;
      const view = getPlayerView(g, seat);
      applyAction(g, decide({ view, level: bot.level, style: bot.style, models: table.models[bot.id]!, memory: table.memory[bot.id]!, rng: table.rngs[bot.id]!, iterations }));
      if (++guard > 400) throw new Error('Mano sin fin');
    }
    const ids = g.players.map((p) => p.id);
    for (const bt of table.bots) observeHand(table.models[bt.id]!, g.log, ids);
    if ((g.phase as string) === 'gameOver') break;
  }
  const winner = g.players[0]!.stack > g.players[1]!.stack ? 0 : 1;
  return { winner, hands };
}
