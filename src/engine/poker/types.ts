import type { Card } from '../../core/cards';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

/** Acción que envía un jugador (humano o IA). `to` = total apostado en la calle tras subir. */
export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number };

/** Etiqueta semántica de lo que pasó (para historial, IA y coach). */
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PokerConfig {
  smallBlind: number;
  bigBlind: number;
  /** Cada cuántas manos se duplican las ciegas (0 = nunca). */
  blindIncreaseEvery: number;
}

export interface PokerPlayer {
  id: string;
  name: string;
  seat: number;
  isHuman: boolean;
  stack: number;
  /** Fichas apostadas en la calle actual. */
  bet: number;
  /** Fichas aportadas en toda la mano (incluye calles anteriores). */
  contributed: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  /** Eliminado del torneo (sin fichas). */
  out: boolean;
  hasActed: boolean;
  /** Valor de `raiseSeq` cuando actuó por última vez (control de re-subidas). */
  actedSeq: number;
}

export type HandEvent =
  | { t: 'start'; hand: number; button: number; sb: number; bb: number; smallBlind: number; bigBlind: number }
  | { t: 'post'; seat: number; amount: number; blind: 'SB' | 'BB' }
  | { t: 'action'; seat: number; street: Street; kind: ActionKind; amount: number; to: number; potBefore: number }
  | { t: 'street'; street: Street; board: Card[] }
  | { t: 'refund'; seat: number; amount: number }
  | { t: 'show'; seat: number; hole: Card[]; score: number; desc: string }
  | { t: 'win'; seat: number; amount: number; pot: number; desc: string | null }
  | { t: 'eliminated'; seat: number };

export interface Pot {
  amount: number;
  eligible: number[];
}

export interface HandResult {
  pots: { amount: number; eligible: number[]; winners: number[]; shares: number[] }[];
  /** Ganancia neta por asiento en esta mano. */
  net: Record<number, number>;
  showdown: boolean;
  /** Puntuación de mano por asiento que llegó al showdown. */
  scores: Record<number, number>;
}

export interface PokerState {
  config: PokerConfig;
  smallBlind: number;
  bigBlind: number;
  players: PokerPlayer[];
  button: number;
  sbSeat: number;
  bbSeat: number;
  deck: Card[];
  deckPos: number;
  board: Card[];
  street: Street;
  currentBet: number;
  minRaise: number;
  raiseSeq: number;
  toAct: number | null;
  lastAggressor: number | null;
  handNumber: number;
  /**
   * 'awaitCards' / 'awaitShowdown': sólo en póker multijugador con cartas cifradas
   * (valor −1 en el mazo): la mano espera a que se descifren cartas.
   */
  phase: 'idle' | 'betting' | 'awaitCards' | 'awaitShowdown' | 'handOver' | 'gameOver';
  /** Posiciones del mazo (o asientos) que faltan por revelar cuando la mano está en espera. */
  awaiting?: { kind: 'cards'; street: Street; positions: number[] } | { kind: 'showdown'; seats: number[] } | null;
  log: HandEvent[];
  /** Asientos cuyas cartas son públicas (showdown). */
  revealed: number[];
  result: HandResult | null;
  /** Fichas al inicio de la mano (para calcular netos). */
  startStacks: Record<number, number>;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  /** Cantidad que falta para igualar. */
  toCall: number;
}
