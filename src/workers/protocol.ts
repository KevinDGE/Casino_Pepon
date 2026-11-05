import type { PokerAction } from '../engine/poker/types';
import type { PokerView } from '../engine/poker/view';
import type { BotMemory, PokerLevel } from '../ai/poker/bots';
import type { ModelStore } from '../ai/poker/opponentModel';
import type { StyleParams } from '../ai/poker/analysis';
import type { PokerAdvice } from '../coach/pokerCoach';

export type WorkerRequest =
  | { type: 'pokerBot'; view: PokerView; level: PokerLevel; style?: StyleParams; models: ModelStore; memory: BotMemory; iterations: number }
  | { type: 'pokerCoach'; view: PokerView; models: ModelStore; iterations: number };

export type WorkerResponse =
  | { type: 'pokerBot'; action: PokerAction; memory: BotMemory }
  | { type: 'pokerCoach'; advice: PokerAdvice };

export interface Envelope<T> {
  id: number;
  payload: T;
  error?: string;
}
