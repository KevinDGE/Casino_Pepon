/// <reference lib="webworker" />
import { handleRequest } from './handle';
import type { Envelope, WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<Envelope<WorkerRequest>>) => {
  const { id, payload } = ev.data;
  try {
    const res = handleRequest(payload);
    ctx.postMessage({ id, payload: res } satisfies Envelope<WorkerResponse>);
  } catch (e) {
    ctx.postMessage({ id, payload: null, error: e instanceof Error ? e.message : String(e) });
  }
};
