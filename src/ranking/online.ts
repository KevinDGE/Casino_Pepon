/**
 * Ranking en línea sobre la base de datos compartida del Artifact de claude.ai
 * (capacidades `db` y `user`). Fuera de claude.ai (build local, otro hosting)
 * `window.claude` no existe y el ranking funciona sólo con tus propios datos.
 *
 * Modelo: un documento por persona, `ranking/<id>`, con sus fichas netas del
 * día, la semana y el mes vigentes. Todos leen; cada quien escribe sólo el suyo
 * (el dueño del artifact puede moderar). Sólo se guarda el id opaco: los
 * nombres se resuelven al mostrar.
 */
import type { PeriodKind, PeriodTotals } from './periods';

/* Tipos mínimos del contrato de capacidades que usamos. */
interface DbSnapshot { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface DbQuerySnapshot { docs: DbSnapshot[]; metadata: { fromCache: boolean } }
interface DbError { code: string; message: string }
interface DbQuery {
  where(f: string, op: string, v: unknown): DbQuery;
  orderBy(f: string, dir?: 'asc' | 'desc'): DbQuery;
  limit(n: number): DbQuery;
  onSnapshot(next: (s: DbQuerySnapshot) => void, err?: (e: DbError) => void): () => void;
}
interface DbDoc { set(d: Record<string, unknown>): Promise<void>; get(): Promise<DbSnapshot> }
interface DbApi { doc(p: string): DbDoc; collection(p: string): DbQuery }
interface Profile { id: string; name: string; avatarUrl: string; color: string; isMe: boolean }
interface UserApi { id(): Promise<string | null>; profiles(ids: string[]): Promise<Record<string, Profile>>; can(n: string): Promise<boolean | null> }
interface ClaudeHost { use(name: string): Promise<unknown> }

export interface RankingBackend {
  db: DbApi;
  user: UserApi;
  myId: string | null;
}

let backendPromise: Promise<RankingBackend | null> | null = null;

/** Resuelve el backend en línea una sola vez (null si no estamos en claude.ai o no hay sesión). */
export function getRankingBackend(): Promise<RankingBackend | null> {
  if (backendPromise) return backendPromise;
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  if (!host || typeof host.use !== 'function') {
    backendPromise = Promise.resolve(null);
    return backendPromise;
  }
  backendPromise = (async () => {
    try {
      const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [DbApi | null, UserApi | null];
      if (!db || !user) return null;
      const myId = await user.id();
      return { db, user, myId };
    } catch {
      return null;
    }
  })();
  return backendPromise;
}

export interface RankingRow {
  id: string;
  net: number;
  rounds: number;
  name: string;
  avatarUrl: string;
  color: string;
  isMe: boolean;
}

const FIELD: Record<PeriodKind, { key: keyof PeriodTotals; net: keyof PeriodTotals; rounds: keyof PeriodTotals }> = {
  day: { key: 'day', net: 'dayNet', rounds: 'dayRounds' },
  week: { key: 'week', net: 'weekNet', rounds: 'weekRounds' },
  month: { key: 'month', net: 'monthNet', rounds: 'monthRounds' },
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);

/**
 * Se suscribe al top 50 de un periodo. Devuelve la función para cancelar.
 * Los datos de otras personas no son confiables: se validan como números.
 */
export function subscribeRanking(
  be: RankingBackend,
  kind: PeriodKind,
  periodKey: string,
  onRows: (rows: RankingRow[], fromCache: boolean) => void,
  onError: (e: DbError) => void,
): () => void {
  const f = FIELD[kind];
  const q = be.db.collection('ranking').where(f.key, '==', periodKey).orderBy(f.net, 'desc').limit(50);
  let alive = true;
  const unsub = q.onSnapshot(
    async (snap) => {
      const base = snap.docs
        .filter((d) => d.exists)
        .map((d) => {
          const x = d.data() ?? {};
          return { id: d.id, net: num(x[f.net]), rounds: num(x[f.rounds]) };
        })
        .filter((r) => r.rounds > 0);
      const profiles = base.length ? await be.user.profiles(base.map((r) => r.id)) : {};
      if (!alive) return;
      onRows(
        base.map((r) => {
          const p = profiles[r.id];
          return { ...r, name: p?.name || '', avatarUrl: p?.avatarUrl ?? '', color: p?.color ?? '#888', isMe: r.id === be.myId };
        }),
        snap.metadata.fromCache,
      );
    },
    (e) => onError(e),
  );
  return () => {
    alive = false;
    unsub();
  };
}

/** Publica los acumulados de esta persona (una escritura a la vez, sólo si cambiaron). */
export async function publishMyTotals(be: RankingBackend, t: PeriodTotals): Promise<'ok' | 'readonly' | 'error'> {
  if (!be.myId) return 'readonly';
  try {
    await be.db.doc(`ranking/${be.myId}`).set({ ...t, v: 1, updatedAt: Date.now() });
    return 'ok';
  } catch (e) {
    const code = (e as DbError)?.code;
    return code === 'invalid_argument' || code === 'not_granted' || code === 'revoked' ? 'readonly' : 'error';
  }
}

/** Reglas de acceso para declarar al publicar el artifact. */
export const RANKING_DB_RULES = [
  { path: 'ranking', read: 'view', write: 'owner' },
  { path: 'ranking/{self}', read: 'view', write: 'interact' },
];
