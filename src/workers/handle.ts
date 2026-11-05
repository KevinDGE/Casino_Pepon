/** Lógica común del worker (también usable en el hilo principal como respaldo). */
import { CryptoRng } from '../core/rng';
import { decide } from '../ai/poker/bots';
import { pokerAdvice } from '../coach/pokerCoach';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { vpHoldEVs } from '../engine/videopoker/videopoker';
import { tcPlayEV } from '../engine/threecard/threecard';
import { myCryptoStep } from '../mp/protocol';

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
    case 'vpEV':
      return { type: 'vpEV', evs: Array.from(vpHoldEVs(req.hand, req.royalPay)) };
    case 'mpStep': {
      const key = { e: BigInt('0x' + req.e), d: BigInt('0x' + req.d) };
      const fake = { lineup: null, state: null, pending: req.pending, myHole: null, mySeat: -1 };
      return { type: 'mpStep', patch: myCryptoStep(fake, req.me, key, rng) };
    }
    case 'tcEV': {
      const r = tcPlayEV(req.hand);
      return { type: 'tcEV', play: r.play, fold: r.fold };
    }
  }
}
