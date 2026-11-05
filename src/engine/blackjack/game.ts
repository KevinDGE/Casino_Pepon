/**
 * Motor de reglas de Blackjack.
 * Muta el estado recibido; la interfaz clona antes de aplicar acciones.
 */
import type { Card } from '../../core/cards';
import { type Rng, shuffleInPlace } from '../../core/rng';
import { cardValue, handTotal, isBlackjack } from './hand';
import type { BJAction, BJHand, BJLegal, BJSeat, BJState, BlackjackRules, HandOutcome } from './types';

export interface BJSeatSetup {
  id: string;
  name: string;
  isHuman: boolean;
  bankroll: number;
}

export function buildShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) shoe.push(c);
  return shoe;
}

export function createBlackjack(rules: BlackjackRules, seats: BJSeatSetup[], rng: Rng): BJState {
  if (seats.length < 1 || seats.length > 5) throw new Error('De 1 a 5 asientos');
  const state: BJState = {
    rules: { ...rules, penetration: Math.min(0.9, Math.max(0.5, rules.penetration)) },
    shoe: [],
    pos: 0,
    cut: 0,
    dealer: [],
    holeRevealed: false,
    seats: seats.map((s) => ({
      id: s.id, name: s.name, isHuman: s.isHuman, bankroll: Math.floor(s.bankroll), baseBet: 0,
      hands: [], activeHand: 0, insurance: 0, insuranceDecided: false, insuranceNet: 0,
    })),
    phase: 'betting',
    turn: null,
    round: 0,
    seen: [],
    log: [],
    dealerBlackjack: false,
  };
  reshuffle(state, rng);
  return state;
}

export function reshuffle(state: BJState, rng: Rng): void {
  state.shoe = shuffleInPlace(buildShoe(state.rules.decks), rng);
  state.pos = 0;
  state.cut = Math.floor(state.shoe.length * state.rules.penetration);
  state.seen = [];
  state.log.push({ t: 'shuffle' });
}

function draw(state: BJState): Card {
  const c = state.shoe[state.pos++];
  if (c === undefined) throw new Error('Zapato agotado');
  return c;
}

function drawVisible(state: BJState): Card {
  const c = draw(state);
  state.seen.push(c);
  return c;
}

const newHand = (bet: number, cards: Card[] = [], fromSplit = false, splitAces = false): BJHand => ({
  cards, bet, doubled: false, fromSplit, splitAces, done: false, outcome: null, net: 0,
});

/**
 * Inicia una ronda. `bets[i]` = apuesta del asiento i (0 = no juega).
 * `stackedShoe` permite fijar las cartas para pruebas.
 */
export function startRound(state: BJState, bets: number[], rng: Rng, stackedShoe?: Card[]): void {
  if (state.phase !== 'betting' && state.phase !== 'settled') throw new Error('Ronda en curso');
  state.log = [];
  if (stackedShoe) {
    state.shoe = stackedShoe.slice();
    state.pos = 0;
    state.cut = state.shoe.length;
    state.seen = [];
  } else if (state.pos >= state.cut) {
    reshuffle(state, rng);
  }
  state.round++;
  state.dealer = [];
  state.holeRevealed = false;
  state.dealerBlackjack = false;
  let anyone = false;
  state.seats.forEach((s, i) => {
    const bet = Math.floor(bets[i] ?? 0);
    s.hands = [];
    s.activeHand = 0;
    s.insurance = 0;
    s.insuranceDecided = false;
    s.insuranceNet = 0;
    s.baseBet = 0;
    if (bet > 0) {
      if (bet > s.bankroll) throw new Error(`${s.name} no tiene fichas suficientes`);
      s.bankroll -= bet;
      s.baseBet = bet;
      s.hands = [newHand(bet)];
      anyone = true;
    }
  });
  if (!anyone) throw new Error('Nadie apostó');
  const playing = state.seats.map((s, i) => (s.hands.length ? i : -1)).filter((i) => i >= 0);
  for (let round = 0; round < 2; round++) {
    for (const i of playing) {
      const c = drawVisible(state);
      state.seats[i]!.hands[0]!.cards.push(c);
      state.log.push({ t: 'deal', seat: i, card: c, hand: 0 });
    }
    if (round === 0) {
      const up = drawVisible(state);
      state.dealer.push(up);
      state.log.push({ t: 'dealer', card: up });
    } else {
      state.dealer.push(draw(state)); // carta oculta: NO va a `seen`
      state.log.push({ t: 'dealer', card: null });
    }
  }
  for (const i of playing) {
    const h = state.seats[i]!.hands[0]!;
    if (isBlackjack(h.cards)) h.done = true;
  }
  if (cardValue(state.dealer[0]!) === 1) {
    state.phase = 'insurance';
    state.turn = null;
    for (const s of state.seats) if (!s.hands.length) s.insuranceDecided = true;
    return;
  }
  afterInsurance(state);
}

export function upcard(state: BJState): Card {
  return state.dealer[0]!;
}

/** Decisión de seguro de un asiento (cantidad 0 = no asegurar). Máximo: mitad de la apuesta. */
export function decideInsurance(state: BJState, seatIdx: number, amount: number): void {
  if (state.phase !== 'insurance') throw new Error('No se ofrece seguro ahora');
  const s = state.seats[seatIdx]!;
  if (s.insuranceDecided) throw new Error('Ya decidiste el seguro');
  const max = Math.min(Math.floor(s.baseBet / 2), s.bankroll);
  const a = Math.max(0, Math.min(Math.floor(amount), max));
  s.insurance = a;
  s.bankroll -= a;
  s.insuranceDecided = true;
  state.log.push({ t: 'insurance', seat: seatIdx, amount: a });
  if (state.seats.every((x) => x.insuranceDecided)) afterInsurance(state);
}

export function maxInsurance(state: BJState, seatIdx: number): number {
  const s = state.seats[seatIdx]!;
  return Math.min(Math.floor(s.baseBet / 2), s.bankroll);
}

function afterInsurance(state: BJState): void {
  const upV = cardValue(state.dealer[0]!);
  const dealerBJ = isBlackjack(state.dealer);
  state.dealerBlackjack = dealerBJ;
  if (state.rules.dealerPeeks && (upV === 1 || upV === 10)) {
    state.log.push({ t: 'peek', blackjack: dealerBJ });
    if (upV === 1) settleInsurance(state, dealerBJ);
    if (dealerBJ) {
      revealHole(state);
      settle(state);
      return;
    }
  }
  state.phase = 'playing';
  state.turn = null;
  advanceTurn(state);
}

function settleInsurance(state: BJState, dealerBJ: boolean): void {
  for (const s of state.seats) {
    if (s.insurance > 0) {
      if (dealerBJ) {
        s.bankroll += s.insurance * 3;
        s.insuranceNet = s.insurance * 2;
      } else {
        s.insuranceNet = -s.insurance;
      }
    }
  }
}

function revealHole(state: BJState): void {
  if (!state.holeRevealed) {
    state.holeRevealed = true;
    state.seen.push(state.dealer[1]!);
    state.log.push({ t: 'reveal', card: state.dealer[1]! });
  }
}

/** Mueve el turno a la siguiente mano pendiente; si no hay, juega el crupier. */
function advanceTurn(state: BJState): void {
  for (let si = 0; si < state.seats.length; si++) {
    const s = state.seats[si]!;
    for (let hi = 0; hi < s.hands.length; hi++) {
      const h = s.hands[hi]!;
      if (!h.done) {
        // Mano nacida de un split con una sola carta: recibe su segunda carta.
        if (h.cards.length === 1) {
          const c = drawVisible(state);
          h.cards.push(c);
          state.log.push({ t: 'deal', seat: si, card: c, hand: hi });
          if (h.splitAces && !state.rules.hitSplitAces && !canSplitHand(state, s, h)) {
            h.done = true;
            continue;
          }
          if (handTotal(h.cards).total === 21) {
            h.done = true;
            continue;
          }
        }
        s.activeHand = hi;
        state.turn = { seat: si, hand: hi };
        return;
      }
    }
  }
  state.turn = null;
  dealerPlay(state);
}

function canSplitHand(state: BJState, s: BJSeat, h: BJHand): boolean {
  if (h.cards.length !== 2) return false;
  if (cardValue(h.cards[0]!) !== cardValue(h.cards[1]!)) return false;
  if (s.hands.length >= state.rules.maxHands) return false;
  if (h.splitAces && !state.rules.resplitAces) return false;
  if (s.bankroll < h.bet) return false;
  return true;
}

function canDoubleHand(state: BJState, s: BJSeat, h: BJHand): boolean {
  if (h.cards.length !== 2 || h.doubled) return false;
  if (h.fromSplit && !state.rules.doubleAfterSplit) return false;
  if (h.splitAces && !state.rules.hitSplitAces) return false;
  if (s.bankroll < h.bet) return false;
  const { total, soft } = handTotal(h.cards);
  if (state.rules.doubleOn === '9-11') return !soft && total >= 9 && total <= 11;
  if (state.rules.doubleOn === '10-11') return !soft && total >= 10 && total <= 11;
  return true;
}

export function getLegal(state: BJState): BJLegal {
  const none = { hit: false, stand: false, double: false, split: false };
  if (state.phase !== 'playing' || !state.turn) return none;
  const s = state.seats[state.turn.seat]!;
  const h = s.hands[state.turn.hand]!;
  const splitAcesLocked = h.splitAces && !state.rules.hitSplitAces;
  return {
    hit: !splitAcesLocked,
    stand: true,
    double: canDoubleHand(state, s, h),
    split: canSplitHand(state, s, h),
  };
}

export function applyBJAction(state: BJState, action: BJAction): void {
  if (state.phase !== 'playing' || !state.turn) throw new Error('No es tu turno');
  const legal = getLegal(state);
  if (!legal[action]) throw new Error(`Acción no permitida: ${action}`);
  const { seat: si, hand: hi } = state.turn;
  const s = state.seats[si]!;
  const h = s.hands[hi]!;
  switch (action) {
    case 'hit': {
      const c = drawVisible(state);
      h.cards.push(c);
      state.log.push({ t: 'action', seat: si, hand: hi, action, card: c });
      if (handTotal(h.cards).total >= 21) h.done = true;
      break;
    }
    case 'stand':
      state.log.push({ t: 'action', seat: si, hand: hi, action });
      h.done = true;
      break;
    case 'double': {
      s.bankroll -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      const c = drawVisible(state);
      h.cards.push(c);
      state.log.push({ t: 'action', seat: si, hand: hi, action, card: c });
      h.done = true;
      break;
    }
    case 'split': {
      s.bankroll -= h.bet;
      const aces = cardValue(h.cards[0]!) === 1;
      const second = h.cards.pop()!;
      h.fromSplit = true;
      h.splitAces = aces;
      const nh = newHand(h.bet, [second], true, aces);
      s.hands.splice(hi + 1, 0, nh);
      state.log.push({ t: 'action', seat: si, hand: hi, action });
      // La mano actual recibe su segunda carta ahora.
      const c = drawVisible(state);
      h.cards.push(c);
      state.log.push({ t: 'deal', seat: si, card: c, hand: hi });
      if (aces && !state.rules.hitSplitAces && !canSplitHand(state, s, h)) h.done = true;
      else if (handTotal(h.cards).total === 21) h.done = true;
      break;
    }
  }
  if (h.done) advanceTurn(state);
}

function dealerShouldHit(state: BJState): boolean {
  const { total, soft } = handTotal(state.dealer);
  if (total < 17) return true;
  if (total === 17 && soft && state.rules.dealerHitsSoft17) return true;
  return false;
}

function dealerPlay(state: BJState): void {
  revealHole(state);
  // Si no queda ninguna mano viva (todas pasadas o blackjack), el crupier no pide.
  const live = state.seats.some((s) =>
    s.hands.some((h) => handTotal(h.cards).total <= 21 && !(isBlackjack(h.cards) && !h.fromSplit)),
  );
  if (live && !(isBlackjack(state.dealer))) {
    while (dealerShouldHit(state)) {
      const c = drawVisible(state);
      state.dealer.push(c);
      state.log.push({ t: 'dealer', card: c });
    }
  }
  if (!state.rules.dealerPeeks && cardValue(state.dealer[0]!) === 1) settleInsurance(state, isBlackjack(state.dealer));
  state.dealerBlackjack = isBlackjack(state.dealer);
  settle(state);
}

function settle(state: BJState): void {
  const d = handTotal(state.dealer);
  const dealerBJ = isBlackjack(state.dealer);
  const bjMult = state.rules.blackjackPays === '3:2' ? 1.5 : 1.2;
  state.seats.forEach((s, si) => {
    s.hands.forEach((h, hi) => {
      const p = handTotal(h.cards);
      const natural = isBlackjack(h.cards) && !h.fromSplit;
      let outcome: HandOutcome;
      let net: number;
      if (p.total > 21) {
        outcome = 'bust';
        net = -h.bet;
      } else if (natural && !dealerBJ) {
        outcome = 'blackjack';
        net = Math.floor(h.bet * bjMult);
      } else if (natural && dealerBJ) {
        outcome = 'push';
        net = 0;
      } else if (dealerBJ) {
        outcome = 'lose';
        net = -h.bet;
      } else if (d.total > 21 || p.total > d.total) {
        outcome = 'win';
        net = h.bet;
      } else if (p.total === d.total) {
        outcome = 'push';
        net = 0;
      } else {
        outcome = 'lose';
        net = -h.bet;
      }
      h.outcome = outcome;
      h.net = net;
      h.done = true;
      s.bankroll += h.bet + net;
      state.log.push({ t: 'settle', seat: si, hand: hi, outcome, net });
    });
  });
  state.turn = null;
  state.phase = 'settled';
}

/** Neto total de la ronda para un asiento (manos + seguro). */
export function seatRoundNet(s: BJSeat): number {
  return s.hands.reduce((a, h) => a + h.net, 0) + s.insuranceNet;
}

/**
 * Composición restante del zapato desde el punto de vista de un jugador
 * (índices 1..10; 1 = As, 10 = cualquier carta de valor 10). Nunca incluye la
 * carta oculta del crupier ni el orden del zapato.
 *  - 'seen': descuenta todas las cartas vistas desde el último barajado (conteo perfecto).
 *  - 'round': descuenta sólo las cartas visibles en la ronda actual.
 */
export function remainingComposition(state: BJState, mode: 'seen' | 'round'): number[] {
  const comp = new Array<number>(11).fill(0);
  const d = state.rules.decks;
  for (let v = 1; v <= 9; v++) comp[v] = 4 * d;
  comp[10] = 16 * d;
  const removed: Card[] = mode === 'seen' ? state.seen : visibleThisRound(state);
  for (const c of removed) comp[cardValue(c)]!--;
  for (let v = 1; v <= 10; v++) comp[v] = Math.max(0, comp[v]!);
  return comp;
}

export function visibleThisRound(state: BJState): Card[] {
  const out: Card[] = [];
  for (const s of state.seats) for (const h of s.hands) out.push(...h.cards);
  out.push(state.dealer[0]!);
  if (state.holeRevealed) out.push(...state.dealer.slice(1));
  return out;
}

export function cardsRemaining(state: BJState): number {
  return state.shoe.length - state.pos;
}
