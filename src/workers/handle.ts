/** Lógica común del worker (también usable en el hilo principal como respaldo). */
import { CryptoRng } from '../core/rng';
import { decide } from '../ai/poker/bots';
import { pokerAdvice } from '../coach/pokerCoach';
import type { WorkerRequest, WorkerResponse } from './protocol';

const rng = new CryptoRng();

export function handleRequest(req: WorkerRequest): WorkerResponse {
  switch (req.type) {
    case 'pokerBot': {
      const memory = structuredClone(req.memory);
      const action = decide({ view: req.view, level: req.level, style: req.style, models: req.models, memory, rng, iterations: req.iterations });
      return { type: 'pokerBot', action, memory };
    }
    case 'pokerCoach':
      return { type: 'pokerCoach', advice: pokerAdvice(req.view, req.models, rng, req.iterations) };
  }
}
