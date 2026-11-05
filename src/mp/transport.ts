/**
 * Transporte del multijugador sobre la base de datos compartida del Artifact.
 * Cada persona escribe sólo `mp/<su id>` (regla `mp/{self}`); todos leen.
 */
import { getRankingBackend, type RankingBackend } from '../ranking/online';
import type { PlayerDoc } from './protocol';

export type { RankingBackend as OnlineBackend };
export const getOnlineBackend = getRankingBackend;

export const MP_DB_RULES = [
  { path: 'mp', read: 'view', write: 'owner' },
  { path: 'mp/{self}', read: 'view', write: 'interact' },
];

interface Snap { docs: { id: string; exists: boolean; data(): Record<string, unknown> | undefined }[]; metadata: { fromCache: boolean } }
type Coll = { where(f: string, op: string, v: unknown): Coll; limit(n: number): Coll; onSnapshot(n: (s: Snap) => void, e?: (err: { code: string }) => void): () => void };

function toDocs(s: Snap): Record<string, PlayerDoc> {
  const out: Record<string, PlayerDoc> = {};
  for (const d of s.docs) {
    if (!d.exists) continue;
    const x = d.data();
    if (x && x.v === 1) out[d.id] = x as unknown as PlayerDoc;
  }
  return out;
}

export function subscribeAll(be: RankingBackend, cb: (docs: Record<string, PlayerDoc>) => void, err: (code: string) => void): () => void {
  const c = be.db.collection('mp') as unknown as Coll;
  return c.limit(500).onSnapshot((s) => cb(toDocs(s)), (e) => err(e.code));
}

export function subscribeTable(be: RankingBackend, tableId: string, cb: (docs: Record<string, PlayerDoc>) => void, err: (code: string) => void): () => void {
  const c = be.db.collection('mp') as unknown as Coll;
  return c.where('table', '==', tableId).onSnapshot((s) => cb(toDocs(s)), (e) => err(e.code));
}

/** Escritor de mi documento: agrupa cambios y hace una escritura a la vez. */
export class MyDocWriter {
  private latest: PlayerDoc | null = null;
  private inflight = false;
  private dirty = false;
  onError: (code: string) => void = () => undefined;
  constructor(private be: RankingBackend) {}
  write(doc: PlayerDoc): void {
    this.latest = doc;
    this.dirty = true;
    void this.flush();
  }
  private async flush(): Promise<void> {
    if (this.inflight || !this.dirty || !this.latest || !this.be.myId) return;
    this.inflight = true;
    this.dirty = false;
    const body = JSON.parse(JSON.stringify(this.latest)) as Record<string, unknown>;
    try {
      await this.be.db.doc(`mp/${this.be.myId}`).set(body);
    } catch (e) {
      this.onError((e as { code?: string })?.code ?? 'unavailable');
    } finally {
      this.inflight = false;
      if (this.dirty) void this.flush();
    }
  }
}
