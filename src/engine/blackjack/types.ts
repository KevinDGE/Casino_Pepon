import type { Card } from '../../core/cards';

export interface BlackjackRules {
  decks: 1 | 2 | 4 | 6 | 8;
  /** El crupier pide con 17 suave (H17). */
  dealerHitsSoft17: boolean;
  blackjackPays: '3:2' | '6:5';
  doubleAfterSplit: boolean;
  doubleOn: 'any' | '9-11' | '10-11';
  /** Máximo de manos tras dividir (2 = sin re-dividir). */
  maxHands: 2 | 3 | 4;
  resplitAces: boolean;
  hitSplitAces: boolean;
  /** El crupier revisa si tiene blackjack con As o 10 visible (regla americana). */
  dealerPeeks: boolean;
  /** Fracción del zapato que se reparte antes de barajar (0.5 – 0.9). */
  penetration: number;
}

export const DEFAULT_RULES: BlackjackRules = {
  decks: 6,
  dealerHitsSoft17: false,
  blackjackPays: '3:2',
  doubleAfterSplit: true,
  doubleOn: 'any',
  maxHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  dealerPeeks: true,
  penetration: 0.75,
};

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BJHand {
  cards: Card[];
  /** Apuesta de esta mano (se duplica al doblar). */
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  done: boolean;
  outcome: HandOutcome | null;
  /** Neto de la mano (ganancia − apuesta). */
  net: number;
}

export interface BJSeat {
  id: string;
  name: string;
  isHuman: boolean;
  bankroll: number;
  baseBet: number;
  hands: BJHand[];
  activeHand: number;
  insurance: number;
  insuranceDecided: boolean;
  insuranceNet: number;
}

export type BJPhase = 'betting' | 'insurance' | 'playing' | 'settled';

export type BJAction = 'hit' | 'stand' | 'double' | 'split';

export type BJEvent =
  | { t: 'shuffle' }
  | { t: 'deal'; seat: number; card: Card; hand: number }
  | { t: 'dealer'; card: Card | null }
  | { t: 'insurance'; seat: number; amount: number }
  | { t: 'peek'; blackjack: boolean }
  | { t: 'action'; seat: number; hand: number; action: BJAction; card?: Card }
  | { t: 'reveal'; card: Card }
  | { t: 'settle'; seat: number; hand: number; outcome: HandOutcome; net: number };

export interface BJState {
  rules: BlackjackRules;
  shoe: Card[];
  pos: number;
  cut: number;
  dealer: Card[];
  holeRevealed: boolean;
  seats: BJSeat[];
  phase: BJPhase;
  turn: { seat: number; hand: number } | null;
  round: number;
  /** Cartas visibles desde el último barajado (para la IA que cuenta). */
  seen: Card[];
  log: BJEvent[];
  dealerBlackjack: boolean;
}

export interface BJLegal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
}
