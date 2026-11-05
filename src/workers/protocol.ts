import type { PokerAction } from '../engine/poker/types';
import type { PokerView } from '../engine/poker/view';
import type { BotMemory, PokerLevel } from '../ai/poker/bots';
import type { ModelStore } from '../ai/poker/opponentModel';
import type { StyleParams } from '../ai/poker/analysis';
import type { PokerAdvice } from '../coach/pokerCoach';
import type { HandMsgs, Pending } from '../mp/protocol';

export type WorkerRequest =
  | { type: 'pokerBot'; view: PokerView; level: PokerLevel; style?: StyleParams; models: ModelStore; memory: BotMemory; iterations: number }
  | { type: 'pokerCoach'; view: PokerView; models: ModelStore; iterations: number }
  | { type: 'vpEV'; hand: number[]; royalPay: number }
  | { type: 'tcEV'; hand: number[] }
  | { type: 'mpStep'; pending: Pending; me: string; e: string; d: string };

export type WorkerResponse =
  | { type: 'pokerBot'; action: PokerAction; memory: BotMemory }
  | { type: 'pokerCoach'; advice: PokerAdvice }
  | { type: 'vpEV'; evs: number[] }
  | { type: 'tcEV'; play: number; fold: number }
  | { type: 'mpStep'; patch: Partial<HandMsgs> | null };

export interface Envelope<T> {
  id: number;
  payload: T;
  error?: string;
}
