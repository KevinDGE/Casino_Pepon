/**
 * Vista "de jugador": lo ÚNICO que reciben la IA y el coach.
 * Nunca incluye el mazo, cartas por salir ni cartas ocultas de rivales
 * (salvo las que ya se mostraron en un showdown).
 */
import type { Card } from '../../core/cards';
import { getLegalActions, positionName, potTotal } from './game';
import type { ActionKind, LegalActions, PokerState, Street } from './types';

export interface PublicPlayer {
  seat: number;
  id: string;
  name: string;
  isHuman: boolean;
  stack: number;
  bet: number;
  contributed: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  position: string;
  /** Sólo propias o reveladas en showdown. */
  hole: Card[] | null;
}

export interface PublicAction {
  seat: number;
  street: Street;
  kind: ActionKind;
  amount: number;
  to: number;
  potBefore: number;
}

export interface PokerView {
  seat: number;
  hole: Card[];
  board: Card[];
  street: Street;
  players: PublicPlayer[];
  button: number;
  sbSeat: number;
  bbSeat: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaise: number;
  pot: number;
  legal: LegalActions;
  actions: PublicAction[];
  handNumber: number;
}

export function getPlayerView(state: PokerState, seat: number): PokerView {
  const me = state.players[seat];
  if (!me) throw new Error('Asiento inválido');
  const actions: PublicAction[] = [];
  for (const e of state.log) {
    if (e.t === 'action') {
      actions.push({ seat: e.seat, street: e.street, kind: e.kind, amount: e.amount, to: e.to, potBefore: e.potBefore });
    }
  }
  return {
    seat,
    hole: me.hole.slice(),
    board: state.board.slice(),
    street: state.street,
    players: state.players.map((p) => ({
      seat: p.seat,
      id: p.id,
      name: p.name,
      isHuman: p.isHuman,
      stack: p.stack,
      bet: p.bet,
      contributed: p.contributed,
      folded: p.folded,
      allIn: p.allIn,
      out: p.out,
      position: p.out ? '' : positionName(state, p.seat),
      hole: p.seat === seat || state.revealed.includes(p.seat) ? p.hole.slice() : null,
    })),
    button: state.button,
    sbSeat: state.sbSeat,
    bbSeat: state.bbSeat,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot: potTotal(state),
    legal: getLegalActions(state, seat),
    actions,
    handNumber: state.handNumber,
  };
}
