/**
 * Motor de reglas de Texas Hold'em No-Limit.
 *
 * Funciones que MUTAN el estado recibido (rápido para torneos). La interfaz
 * clona el estado antes de aplicar acciones para mantener inmutabilidad.
 *
 * Reglas implementadas:
 *  - Ciegas (en mano a mano el botón pone la ciega pequeña y habla primero preflop).
 *  - Ciega grande corta: los demás deben igualar la ciega completa.
 *  - Subida mínima = tamaño de la última subida completa (mínimo la ciega grande).
 *  - All-in incompleto no reabre la acción para quien ya habló.
 *  - Devolución de apuesta no igualada, botes secundarios, empates y fichas impares
 *    (al primer ganador a la izquierda del botón).
 *  - Si quedan ≤ 1 jugadores con fichas para apostar, se reparten las cartas restantes.
 *  - Eliminación de jugadores sin fichas; subida de ciegas opcional.
 */
import { type Rng } from '../../core/rng';
import { shuffledDeck } from '../../core/cards';
import { evaluate, describeScore } from './handEval';
import type {
  ActionKind, HandResult, LegalActions, PokerAction, PokerConfig, PokerPlayer, PokerState, Pot, Street,
} from './types';

export interface SeatSetup {
  id: string;
  name: string;
  isHuman: boolean;
  stack: number;
}

export function createGame(config: PokerConfig, seats: SeatSetup[], buttonSeat = 0): PokerState {
  if (seats.length < 2 || seats.length > 10) throw new Error('Se requieren de 2 a 10 jugadores');
  if (config.smallBlind <= 0 || config.bigBlind < config.smallBlind) throw new Error('Ciegas inválidas');
  const players: PokerPlayer[] = seats.map((s, i) => ({
    id: s.id,
    name: s.name,
    seat: i,
    isHuman: s.isHuman,
    stack: Math.floor(s.stack),
    bet: 0,
    contributed: 0,
    hole: [],
    folded: false,
    allIn: false,
    out: s.stack <= 0,
    hasActed: false,
    actedSeq: -1,
  }));
  return {
    config,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    players,
    // Se coloca "uno antes" para que startHand lo avance al asiento indicado.
    button: prevSeat(players, buttonSeat),
    sbSeat: -1,
    bbSeat: -1,
    deck: [],
    deckPos: 0,
    board: [],
    street: 'preflop',
    currentBet: 0,
    minRaise: config.bigBlind,
    raiseSeq: 0,
    toAct: null,
    lastAggressor: null,
    handNumber: 0,
    phase: 'idle',
    log: [],
    revealed: [],
    result: null,
    startStacks: {},
  };
}

function prevSeat(players: PokerPlayer[], seat: number): number {
  const n = players.length;
  return (seat - 1 + n) % n;
}

/** Siguiente asiento (en sentido horario) que cumple el predicado. */
export function nextSeat(state: PokerState, from: number, pred: (p: PokerPlayer) => boolean): number {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const s = (from + k) % n;
    if (pred(state.players[s]!)) return s;
  }
  return -1;
}

const inHand = (p: PokerPlayer) => !p.out && !p.folded;
const canBet = (p: PokerPlayer) => !p.out && !p.folded && !p.allIn;
const alive = (p: PokerPlayer) => !p.out;

export function activePlayers(state: PokerState): PokerPlayer[] {
  return state.players.filter(alive);
}

export function potTotal(state: PokerState): number {
  let t = 0;
  for (const p of state.players) t += p.contributed;
  return t;
}

/** Comienza una nueva mano. `deck` permite inyectar un mazo (pruebas / duplicado). */
export function startHand(state: PokerState, rng: Rng, deck?: number[]): void {
  for (const p of state.players) if (!p.out && p.stack <= 0) p.out = true;
  const alivePlayers = state.players.filter(alive);
  if (alivePlayers.length < 2) {
    state.phase = 'gameOver';
    state.toAct = null;
    return;
  }
  state.handNumber++;
  const every = state.config.blindIncreaseEvery;
  if (every > 0) {
    const level = Math.floor((state.handNumber - 1) / every);
    const mult = 2 ** Math.min(level, 20);
    state.smallBlind = state.config.smallBlind * mult;
    state.bigBlind = state.config.bigBlind * mult;
  }
  state.deck = deck ? deck.slice() : shuffledDeck(rng);
  state.deckPos = 0;
  state.board = [];
  state.street = 'preflop';
  state.log = [];
  state.revealed = [];
  state.result = null;
  state.lastAggressor = null;
  state.raiseSeq = 0;
  state.startStacks = {};
  for (const p of state.players) {
    p.bet = 0;
    p.contributed = 0;
    p.hole = [];
    p.folded = p.out;
    p.allIn = false;
    p.hasActed = false;
    p.actedSeq = -1;
    if (!p.out) state.startStacks[p.seat] = p.stack;
  }

  state.button = nextSeat(state, state.button, alive);
  const headsUp = alivePlayers.length === 2;
  state.sbSeat = headsUp ? state.button : nextSeat(state, state.button, alive);
  state.bbSeat = nextSeat(state, state.sbSeat, alive);
  state.log.push({
    t: 'start', hand: state.handNumber, button: state.button, sb: state.sbSeat, bb: state.bbSeat,
    smallBlind: state.smallBlind, bigBlind: state.bigBlind,
  });

  postBlind(state, state.sbSeat, state.smallBlind, 'SB');
  postBlind(state, state.bbSeat, state.bigBlind, 'BB');
  state.currentBet = state.bigBlind;
  state.minRaise = state.bigBlind;

  // Reparto: dos vueltas, empezando a la izquierda del botón.
  const order: number[] = [];
  let s = state.button;
  for (let i = 0; i < alivePlayers.length; i++) {
    s = nextSeat(state, s, alive);
    order.push(s);
  }
  for (let round = 0; round < 2; round++) {
    for (const seat of order) state.players[seat]!.hole.push(drawCard(state));
  }

  state.phase = 'betting';
  // Primero en hablar preflop: a la izquierda de la ciega grande (en HU: el botón/SB).
  const first = nextSeat(state, state.bbSeat, canBet);
  state.toAct = first;
  // Si nadie puede actuar (todos all-in por las ciegas) o sólo uno y ya iguala, avanzar.
  if (first < 0 || bettingRoundComplete(state)) {
    advanceStreet(state);
  }
}

function drawCard(state: PokerState): number {
  const c = state.deck[state.deckPos++];
  if (c === undefined) throw new Error('Mazo agotado');
  return c;
}

/**
 * Multijugador con mazo cifrado: reanuda una mano en espera una vez que el
 * mazo (o las cartas propias de los jugadores en el showdown) ya tienen valores.
 */
export function continueHand(state: PokerState): void {
  if (state.phase === 'awaitCards') {
    state.phase = 'betting';
    state.awaiting = null;
    advanceStreet(state, true);
  } else if (state.phase === 'awaitShowdown') {
    state.phase = 'betting';
    state.awaiting = null;
    showdown(state);
  }
}

/** Posiciones del mazo de las cartas propias de cada asiento (orden de reparto). */
export function holePositions(state: PokerState): Record<number, [number, number]> {
  const alivePlayers = state.players.filter((p) => !p.out);
  const n = alivePlayers.length;
  const out: Record<number, [number, number]> = {};
  let s = state.button;
  for (let k = 0; k < n; k++) {
    s = nextSeat(state, s, (p) => !p.out);
    out[s] = [k, k + n];
  }
  return out;
}

function postBlind(state: PokerState, seat: number, amount: number, blind: 'SB' | 'BB'): void {
  const p = state.players[seat]!;
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.contributed += a;
  if (p.stack === 0) p.allIn = true;
  state.log.push({ t: 'post', seat, amount: a, blind });
}

export function getLegalActions(state: PokerState, seat: number = state.toAct ?? -1): LegalActions {
  const p = state.players[seat];
  const none: LegalActions = {
    canFold: false, canCheck: false, canCall: false, callAmount: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, toCall: 0,
  };
  if (!p || state.phase !== 'betting' || state.toAct !== seat || !canBet(p)) return none;
  const toCall = Math.max(0, state.currentBet - p.bet);
  const maxTo = p.bet + p.stack;
  const reopen = !p.hasActed || p.actedSeq < state.raiseSeq;
  // ¿Queda alguien más que pueda responder a una subida?
  const othersCanAct = state.players.some((o) => o.seat !== seat && canBet(o));
  const canRaise = reopen && maxTo > state.currentBet && othersCanAct;
  const fullMin = state.currentBet === 0 ? state.bigBlind : state.currentBet + state.minRaise;
  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, p.stack),
    canRaise,
    minRaiseTo: canRaise ? Math.min(fullMin, maxTo) : 0,
    maxRaiseTo: canRaise ? maxTo : 0,
    toCall,
  };
}

export class IllegalActionError extends Error {}

/** Aplica la acción del jugador que tiene el turno. */
export function applyAction(state: PokerState, action: PokerAction): void {
  const seat = state.toAct;
  if (seat === null || state.phase !== 'betting') throw new IllegalActionError('No es momento de actuar');
  const p = state.players[seat]!;
  const legal = getLegalActions(state, seat);
  const potBefore = potTotal(state);
  const street = state.street;
  const log = (kind: ActionKind, amount: number) =>
    state.log.push({ t: 'action', seat, street, kind, amount, to: p.bet, potBefore });

  switch (action.type) {
    case 'fold': {
      if (!legal.canFold) throw new IllegalActionError('No puedes retirarte cuando puedes pasar');
      p.folded = true;
      log('fold', 0);
      break;
    }
    case 'check': {
      if (!legal.canCheck) throw new IllegalActionError('No puedes pasar: hay una apuesta');
      log('check', 0);
      break;
    }
    case 'call': {
      if (!legal.canCall) throw new IllegalActionError('No hay nada que igualar');
      const a = legal.callAmount;
      p.stack -= a;
      p.bet += a;
      p.contributed += a;
      if (p.stack === 0) p.allIn = true;
      log(p.allIn ? 'allin' : 'call', a);
      break;
    }
    case 'raise': {
      if (!legal.canRaise) throw new IllegalActionError('No puedes subir ahora');
      const to = Math.floor(action.to);
      if (to > legal.maxRaiseTo) throw new IllegalActionError('No tienes tantas fichas');
      if (to < legal.minRaiseTo) throw new IllegalActionError(`La subida mínima es a ${legal.minRaiseTo}`);
      const added = to - p.bet;
      const wasBet = state.currentBet === 0;
      const increment = to - state.currentBet;
      p.stack -= added;
      p.contributed += added;
      p.bet = to;
      if (p.stack === 0) p.allIn = true;
      const fullRaise = wasBet ? to >= state.bigBlind : increment >= state.minRaise;
      if (fullRaise) {
        state.minRaise = Math.max(increment, state.bigBlind);
        state.raiseSeq++;
      }
      state.currentBet = Math.max(state.currentBet, to);
      state.lastAggressor = seat;
      log(p.allIn ? 'allin' : wasBet ? 'bet' : 'raise', added);
      break;
    }
  }
  p.hasActed = true;
  p.actedSeq = state.raiseSeq;

  // ¿Sólo queda un jugador?
  const remaining = state.players.filter(inHand);
  if (remaining.length === 1) {
    finishUncontested(state, remaining[0]!.seat);
    return;
  }
  if (bettingRoundComplete(state)) {
    advanceStreet(state);
  } else {
    state.toAct = nextSeat(state, seat, canBet);
  }
}

function bettingRoundComplete(state: PokerState): boolean {
  const bettors = state.players.filter(canBet);
  if (bettors.length === 0) return true;
  // Un solo jugador con fichas: termina si ya iguala la apuesta máxima.
  if (bettors.length === 1) {
    const b = bettors[0]!;
    const maxBet = Math.max(...state.players.filter(inHand).map((p) => p.bet));
    return b.bet >= maxBet && (b.hasActed || b.bet >= state.currentBet);
  }
  return bettors.every((p) => p.hasActed && p.bet === state.currentBet);
}

/** Devuelve la parte de la apuesta que nadie igualó. */
function returnUncalled(state: PokerState): void {
  let top: PokerPlayer | null = null;
  let second = 0;
  for (const p of state.players) {
    if (p.out) continue;
    if (!top || p.contributed > top.contributed) {
      if (top) second = Math.max(second, top.contributed);
      top = p;
    } else {
      second = Math.max(second, p.contributed);
    }
  }
  if (top && top.contributed > second) {
    const refund = top.contributed - second;
    top.contributed -= refund;
    top.bet = Math.max(0, top.bet - refund);
    top.stack += refund;
    if (top.stack > 0) top.allIn = false;
    state.log.push({ t: 'refund', seat: top.seat, amount: refund });
  }
}

function advanceStreet(state: PokerState, resuming = false): void {
  // Mientras no se pueda apostar más, repartir todo hasta el showdown.
  for (;;) {
    if (resuming) {
      resuming = false;
    } else {
    returnUncalled(state);
    for (const p of state.players) {
      p.bet = 0;
      p.hasActed = false;
      p.actedSeq = -1;
    }
    state.currentBet = 0;
    state.minRaise = state.bigBlind;
    state.raiseSeq = 0;
    }
    if (state.street === 'river') {
      showdown(state);
      return;
    }
    const nextStreet: Street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
    const n = nextStreet === 'flop' ? 3 : 1;
    // Mazo cifrado: si las cartas de esta calle aún no se conocen, esperar.
    const positions = Array.from({ length: n }, (_, i) => state.deckPos + 1 + i);
    if (positions.some((pos) => (state.deck[pos] ?? -1) < 0)) {
      state.phase = 'awaitCards';
      state.toAct = null;
      state.awaiting = { kind: 'cards', street: nextStreet, positions };
      return;
    }
    drawCard(state); // quemar
    for (let i = 0; i < n; i++) state.board.push(drawCard(state));
    state.street = nextStreet;
    state.log.push({ t: 'street', street: nextStreet, board: state.board.slice() });
    const bettors = state.players.filter(canBet);
    if (bettors.length >= 2) {
      // Postflop habla primero el primer jugador activo a la izquierda del botón.
      state.toAct = nextSeat(state, state.button, canBet);
      return;
    }
    // 0 o 1 jugador con fichas: no hay más apuestas posibles.
  }
}

function finishUncontested(state: PokerState, winner: number): void {
  returnUncalled(state);
  const total = potTotal(state);
  const w = state.players[winner]!;
  w.stack += total;
  state.log.push({ t: 'win', seat: winner, amount: total, pot: 0, desc: null });
  const result: HandResult = {
    pots: [{ amount: total, eligible: [winner], winners: [winner], shares: [total] }],
    net: {},
    showdown: false,
    scores: {},
  };
  endHand(state, result);
}

/** Construye botes principal y secundarios a partir de las aportaciones. */
export function buildPots(players: readonly PokerPlayer[]): Pot[] {
  const contenders = players.filter((p) => !p.out && !p.folded && p.contributed > 0);
  const levels = [...new Set(contenders.map((p) => p.contributed))].sort((a, b) => a - b);
  const maxAll = Math.max(0, ...players.map((p) => p.contributed));
  if (levels.length === 0 || levels[levels.length - 1]! < maxAll) levels.push(maxAll);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.contributed, level) - prev);
    const eligible = contenders.filter((p) => p.contributed >= level).map((p) => p.seat);
    if (amount > 0) {
      if (eligible.length === 0 && pots.length > 0) {
        pots[pots.length - 1]!.amount += amount;
      } else {
        pots.push({ amount, eligible });
      }
    }
    prev = level;
  }
  // Fusiona botes consecutivos con los mismos elegibles.
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.join(',') === pot.eligible.join(',')) last.amount += pot.amount;
    else merged.push({ amount: pot.amount, eligible: [...pot.eligible] });
  }
  return merged;
}

function showdown(state: PokerState): void {
  const contenders = state.players.filter(inHand);
  // Mazo cifrado: hacen falta las cartas propias de quienes llegan al showdown.
  const hidden = contenders.filter((p) => p.hole.some((c) => c < 0)).map((p) => p.seat);
  if (hidden.length) {
    state.phase = 'awaitShowdown';
    state.toAct = null;
    state.awaiting = { kind: 'showdown', seats: contenders.map((p) => p.seat) };
    return;
  }
  const scores: Record<number, number> = {};
  for (const p of contenders) {
    const s = evaluate([...p.hole, ...state.board]);
    scores[p.seat] = s;
    state.revealed.push(p.seat);
    state.log.push({ t: 'show', seat: p.seat, hole: p.hole.slice(), score: s, desc: describeScore(s) });
  }
  const pots = buildPots(state.players);
  const result: HandResult = { pots: [], net: {}, showdown: true, scores };
  pots.forEach((pot, idx) => {
    let best = -1;
    for (const s of pot.eligible) best = Math.max(best, scores[s] ?? -1);
    const winners = pot.eligible.filter((s) => scores[s] === best);
    // Orden de reparto de fichas impares: desde la izquierda del botón.
    const ordered = orderFromButton(state, winners);
    const base = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - base * winners.length;
    const shares = ordered.map(() => base);
    for (let i = 0; rem > 0; i = (i + 1) % ordered.length, rem--) shares[i]!++;
    ordered.forEach((s, i) => {
      state.players[s]!.stack += shares[i]!;
      state.log.push({ t: 'win', seat: s, amount: shares[i]!, pot: idx, desc: describeScore(best) });
    });
    result.pots.push({ amount: pot.amount, eligible: pot.eligible, winners: ordered, shares });
  });
  endHand(state, result);
}

function orderFromButton(state: PokerState, seats: number[]): number[] {
  const n = state.players.length;
  return [...seats].sort((a, b) => ((a - state.button - 1 + n) % n) - ((b - state.button - 1 + n) % n));
}

function endHand(state: PokerState, result: HandResult): void {
  for (const p of state.players) {
    if (state.startStacks[p.seat] !== undefined) result.net[p.seat] = p.stack - state.startStacks[p.seat]!;
    p.bet = 0;
  }
  for (const p of state.players) {
    if (!p.out && p.stack === 0) {
      p.out = true;
      state.log.push({ t: 'eliminated', seat: p.seat });
    }
  }
  state.result = result;
  state.toAct = null;
  state.phase = state.players.filter(alive).length < 2 ? 'gameOver' : 'handOver';
}

/** Nombre de la posición en la mesa (BTN, SB, BB, UTG, MP, CO, …). */
export function positionName(state: PokerState, seat: number): string {
  const n = state.players.filter(alive).length;
  if (seat === state.button) return 'BTN';
  if (seat === state.sbSeat) return 'SB';
  if (seat === state.bbSeat) return 'BB';
  const order: number[] = [];
  let s = state.bbSeat;
  for (let k = 0; k < n; k++) {
    s = nextSeat(state, s, alive);
    if (s === state.button || s < 0) break;
    order.push(s);
  }
  const names: Record<number, string[]> = { 1: ['UTG'], 2: ['UTG', 'CO'], 3: ['UTG', 'MP', 'CO'] };
  const list = names[order.length] ?? order.map((_, i) => (i === order.length - 1 ? 'CO' : i === 0 ? 'UTG' : `MP${i}`));
  const idx = order.indexOf(seat);
  return idx >= 0 ? list[idx] ?? '' : '';
}

/** Copia profunda barata del estado (para la interfaz). */
export function cloneState(state: PokerState): PokerState {
  return structuredClone(state);
}
