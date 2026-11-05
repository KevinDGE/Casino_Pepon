/**
 * Cliente RPC del Web Worker de IA. Los cálculos pesados (Monte Carlo de póker)
 * se ejecutan fuera del hilo de la interfaz. Hay dos workers para que el coach
 * y los rivales no se bloqueen entre sí. Si el navegador no soporta workers de
 * módulo, se usa el hilo principal como respaldo.
 */
import type { Envelope, WorkerRequest, WorkerResponse } from './protocol';

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

class WorkerChannel {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private failed = false;

  private ensure(): Worker | null {
    if (this.worker || this.failed) return this.worker;
    try {
      this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module', name: 'ia-casino' });
      this.worker.onmessage = (ev: MessageEvent<Envelope<WorkerResponse>>) => {
        const p = this.pending.get(ev.data.id);
        if (!p) return;
        this.pending.delete(ev.data.id);
        if (ev.data.error) p.reject(new Error(ev.data.error));
        else p.resolve(ev.data.payload);
      };
      this.worker.onerror = () => {
        this.failed = true;
        for (const p of this.pending.values()) p.reject(new Error('Worker no disponible'));
        this.pending.clear();
        this.worker = null;
      };
    } catch {
      this.failed = true;
      this.worker = null;
    }
    return this.worker;
  }

  async request(req: WorkerRequest): Promise<WorkerResponse> {
    const w = this.ensure();
    if (!w) {
      const { handleRequest } = await import('./handle');
      return handleRequest(req);
    }
    const id = this.nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, payload: req } satisfies Envelope<WorkerRequest>);
    }).catch(async () => {
      const { handleRequest } = await import('./handle');
      return handleRequest(req);
    });
  }
}

const bots = new WorkerChannel();
const coach = new WorkerChannel();

export async function requestBotAction(req: Extract<WorkerRequest, { type: 'pokerBot' }>) {
  const r = await bots.request(req);
  if (r.type !== 'pokerBot') throw new Error('Respuesta inesperada');
  return r;
}

export async function requestCoach(req: Extract<WorkerRequest, { type: 'pokerCoach' }>) {
  const r = await coach.request(req);
  if (r.type !== 'pokerCoach') throw new Error('Respuesta inesperada');
  return r.advice;
}

const math = new WorkerChannel();

/** EV exacto de las 32 formas de conservar cartas en video póker (en el worker). */
export async function requestVideoPokerEVs(hand: number[], royalPay: number): Promise<number[]> {
  const r = await math.request({ type: 'vpEV', hand, royalPay });
  if (r.type !== 'vpEV') throw new Error('Respuesta inesperada');
  return r.evs;
}

export async function requestThreeCardEV(hand: number[]): Promise<{ play: number; fold: number }> {
  const r = await math.request({ type: 'tcEV', hand });
  if (r.type !== 'tcEV') throw new Error('Respuesta inesperada');
  return { play: r.play, fold: r.fold };
}
