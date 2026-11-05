/**
 * Esquema del progreso guardado localmente (sin cuentas ni servidor).
 */
import type { BlackjackRules } from '../engine/blackjack/types';
import { DEFAULT_RULES } from '../engine/blackjack/types';
import { emptyTotals, type PeriodTotals } from '../ranking/periods';

export const STARTING_CHIPS = 10_000;
export const SCHEMA_VERSION = 1;

export type MotionPref = 'system' | 'reduce' | 'full';
export type Speed = 'calm' | 'normal' | 'fast';

export interface Settings {
  sound: boolean;
  volume: number;
  motion: MotionPref;
  coach: boolean;
  speed: Speed;
  haptics: boolean;
  autoNextHand: boolean;
  /** Minutos para el recordatorio de pausa (0 = desactivado). */
  breakReminder: number;
  fourColorDeck: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: false,
  volume: 0.6,
  motion: 'system',
  coach: true,
  speed: 'normal',
  haptics: true,
  autoNextHand: false,
  breakReminder: 60,
  fourColorDeck: false,
};

export interface PokerStats {
  hands: number;
  handsWon: number;
  net: number;
  biggestPot: number;
  showdowns: number;
  showdownsWon: number;
  vpip: number;
  pfr: number;
  decisions: number;
  good: number;
  inaccuracies: number;
  errors: number;
  evLossBB: number;
  tags: Record<string, number>;
  tablesWon: number;
  tablesPlayed: number;
}

export interface BlackjackStats {
  rounds: number;
  net: number;
  wagered: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  decisions: number;
  good: number;
  inaccuracies: number;
  errors: number;
  evLoss: number;
  tags: Record<string, number>;
}

export interface RouletteStats {
  spins: number;
  wagered: number;
  net: number;
  expectedLoss: number;
  biggestWin: number;
  betsByKind: Record<string, number>;
  numbers: number[];
}

/** Estadísticas comunes de los juegos de mesa y máquinas adicionales. */
export interface ArcadeStats {
  rounds: number;
  wagered: number;
  returned: number;
  net: number;
  biggestWin: number;
  /** Decisiones revisadas por el coach (juegos con decisión). */
  decisions: number;
  good: number;
  evLoss: number;
}

export const emptyArcadeStats = (): ArcadeStats => ({ rounds: 0, wagered: 0, returned: 0, net: 0, biggestWin: 0, decisions: 0, good: 0, evLoss: 0 });

export interface Stats {
  poker: PokerStats;
  blackjack: BlackjackStats;
  roulette: RouletteStats;
  arcade: Record<string, ArcadeStats>;
}

export const emptyPokerStats = (): PokerStats => ({
  hands: 0, handsWon: 0, net: 0, biggestPot: 0, showdowns: 0, showdownsWon: 0, vpip: 0, pfr: 0,
  decisions: 0, good: 0, inaccuracies: 0, errors: 0, evLossBB: 0, tags: {}, tablesWon: 0, tablesPlayed: 0,
});
export const emptyBJStats = (): BlackjackStats => ({
  rounds: 0, net: 0, wagered: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, decisions: 0, good: 0, inaccuracies: 0,
  errors: 0, evLoss: 0, tags: {},
});
export const emptyRouletteStats = (): RouletteStats => ({
  spins: 0, wagered: 0, net: 0, expectedLoss: 0, biggestWin: 0, betsByKind: {}, numbers: new Array(37).fill(0),
});

export interface PokerHistoryEntry {
  id: string;
  ts: number;
  hand: number;
  hole: number[];
  board: number[];
  net: number;
  pot: number;
  summary: string;
  lines: string[];
  review: { grade: string; comment: string }[];
}

export interface BlackjackHistoryEntry {
  id: string;
  ts: number;
  dealer: number[];
  hands: { cards: number[]; bet: number; outcome: string; net: number }[];
  insuranceNet: number;
  net: number;
  review: { grade: string; comment: string }[];
}

export interface RouletteHistoryEntry {
  id: string;
  ts: number;
  result: number;
  bets: { desc: string; amount: number; net: number }[];
  net: number;
}

export interface ArcadeHistoryEntry {
  id: string;
  ts: number;
  game: string;
  summary: string;
  wagered: number;
  net: number;
}

export interface History {
  poker: PokerHistoryEntry[];
  blackjack: BlackjackHistoryEntry[];
  roulette: RouletteHistoryEntry[];
  arcade: ArcadeHistoryEntry[];
}

export interface PokerSetup {
  rivals: number;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'mixed';
  bigBlind: number;
  buyInBB: number;
  blindIncreaseEvery: number;
}

export interface BlackjackSetup {
  rules: BlackjackRules;
  companions: number;
  companionLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface SavedProfile {
  version: number;
  chips: number;
  resets: number;
  settings: Settings;
  stats: Stats;
  history: History;
  onboardingDone: boolean;
  tutorialsSeen: Record<string, boolean>;
  pokerSetup: PokerSetup;
  blackjackSetup: BlackjackSetup;
  lastBets: { blackjack: number; roulette: { kind: string; numbers: number[]; amount: number }[] };
  /** Fichas netas ganadas por periodo (para el ranking). Reiniciar fichas no cuenta. */
  ranking: PeriodTotals;
}

export const DEFAULT_POKER_SETUP: PokerSetup = { rivals: 3, level: 'expert', bigBlind: 20, buyInBB: 100, blindIncreaseEvery: 0 };
export const DEFAULT_BJ_SETUP: BlackjackSetup = { rules: { ...DEFAULT_RULES }, companions: 1, companionLevel: 'advanced' };

export function defaultProfile(): SavedProfile {
  return {
    version: SCHEMA_VERSION,
    chips: STARTING_CHIPS,
    resets: 0,
    settings: { ...DEFAULT_SETTINGS },
    stats: { poker: emptyPokerStats(), blackjack: emptyBJStats(), roulette: emptyRouletteStats(), arcade: {} },
    history: { poker: [], blackjack: [], roulette: [], arcade: [] },
    onboardingDone: false,
    tutorialsSeen: {},
    pokerSetup: { ...DEFAULT_POKER_SETUP },
    blackjackSetup: { ...DEFAULT_BJ_SETUP, rules: { ...DEFAULT_RULES } },
    lastBets: { blackjack: 100, roulette: [] },
    ranking: emptyTotals(),
  };
}

export const HISTORY_LIMIT = 100;
