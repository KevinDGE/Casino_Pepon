/**
 * Backend en línea para la versión publicada fuera de claude.ai (GitHub Pages),
 * sobre Firebase: sesión anónima + Firestore. Expone la misma forma que las
 * capacidades `db` y `user` del Artifact, así el ranking y las mesas en línea
 * no saben cuál de los dos están usando.
 *
 * - Cada navegador obtiene un id anónimo de Firebase (sin correo ni contraseña).
 * - Todos leen; cada quien escribe sólo `ranking/<su id>` y `mp/<su id>`
 *   (lo hacen cumplir las reglas de `firebase/firestore.rules`).
 * - No hay perfiles: cada persona elige un apodo, que viaja en sus documentos.
 *
 * Este módulo se carga sólo en la build de GitHub Pages (import dinámico), así
 * que el SDK de Firebase no pesa en las demás versiones.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  limit as qLimit,
  onSnapshot,
  orderBy as qOrderBy,
  query,
  setDoc,
  updateDoc,
  where as qWhere,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type WhereFilterOp,
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from './firebaseConfig';
import type { RankingBackend } from './online';

const ALIAS_KEY = 'casino-pepon:alias';
const COLORS = ['#e0b44c', '#d4573b', '#3aa17e', '#4f86c6', '#9b6bc9', '#c75c8e', '#5fb3b3', '#c98a3a'];

/** Limpia un apodo: sin caracteres de control, espacios colapsados, máximo 20. */
export function cleanAlias(s: string): string {
  return Array.from(s.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 20).join('');
}

/** Color estable por id (para el avatar sin foto). */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

/**
 * Prepara un documento para Firestore: quita `undefined`, convierte −0 en 0
 * (Firestore lo guardaría como decimal y las reglas piden enteros).
 */
export function sanitize(v: unknown): unknown {
  if (typeof v === 'number') return Object.is(v, -0) ? 0 : v;
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : sanitize(x)));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = sanitize(x);
    return out;
  }
  return v;
}

function readAlias(): string {
  try {
    return cleanAlias(globalThis.localStorage?.getItem(ALIAS_KEY) ?? '');
  } catch {
    return '';
  }
}

const codeOf = (e: unknown): string => {
  const c = (e as { code?: string })?.code ?? 'unavailable';
  return c.replace(/^firestore\//, '');
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export interface AliasApi {
  get(): string;
  set(alias: string): Promise<void>;
}

/** Arma el backend sobre una instancia de Firestore ya creada (separado para poder probarlo). */
export function makeBackend(fs: Firestore, myId: string | null): RankingBackend & { alias: AliasApi } {
  /** Apodos vistos en las suscripciones (id → apodo). */
  const aliases = new Map<string, string>();
  let myAlias = readAlias();
  const remember = (id: string, data: DocumentData | undefined) => {
    const a = typeof data?.alias === 'string' ? cleanAlias(data.alias) : '';
    if (a) aliases.set(id, a);
  };

  type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
  const wrapDoc = (id: string, exists: boolean, data: DocumentData | undefined): Snap => ({ id, exists, data: () => data as Record<string, unknown> | undefined });

  const makeQuery = (path: string, cs: QueryConstraint[]) => ({
    where: (f: string, op: string, v: unknown) => makeQuery(path, [...cs, qWhere(f, op as WhereFilterOp, v)]),
    orderBy: (f: string, dir: 'asc' | 'desc' = 'asc') => makeQuery(path, [...cs, qOrderBy(f, dir)]),
    limit: (n: number) => makeQuery(path, [...cs, qLimit(n)]),
    onSnapshot: (next: (s: { docs: Snap[]; metadata: { fromCache: boolean } }) => void, err?: (e: { code: string; message: string }) => void) =>
      onSnapshot(
        query(collection(fs, path), ...cs),
        (s) => {
          const docs = s.docs.map((d) => {
            const x = d.data();
            remember(d.id, x);
            return wrapDoc(d.id, true, x);
          });
          next({ docs, metadata: { fromCache: s.metadata.fromCache } });
        },
        (e) => err?.({ code: codeOf(e), message: e.message }),
      ),
  });

  const db = {
    doc: (p: string) => ({
      async set(d: Record<string, unknown>) {
        const body = sanitize(myAlias ? { ...d, alias: myAlias } : d) as DocumentData;
        try {
          await setDoc(doc(fs, p), body);
        } catch (e) {
          throw { code: codeOf(e), message: (e as Error)?.message ?? '' };
        }
      },
      async get() {
        const s = await getDoc(doc(fs, p));
        const x = s.data();
        remember(s.id, x);
        return wrapDoc(s.id, s.exists(), x);
      },
    }),
    collection: (p: string) => makeQuery(p, []),
  };

  const user = {
    id: async () => myId,
    can: async () => !!myId,
    profiles: async (ids: string[]) =>
      Object.fromEntries(
        ids.map((id) => [id, { id, name: id === myId ? myAlias : aliases.get(id) ?? '', avatarUrl: '', color: colorFor(id), isMe: id === myId }]),
      ),
  };

  const alias: AliasApi = {
    get: () => myAlias,
    async set(a: string) {
      myAlias = cleanAlias(a);
      try {
        if (myAlias) globalThis.localStorage?.setItem(ALIAS_KEY, myAlias);
        else globalThis.localStorage?.removeItem(ALIAS_KEY);
      } catch {
        /* sin almacenamiento: el apodo vive sólo en esta visita */
      }
      if (!myId || !myAlias) return;
      aliases.set(myId, myAlias);
      // Actualiza el apodo en los documentos que ya existan (si no existen, no pasa nada).
      await Promise.allSettled(['ranking', 'mp'].map((c) => updateDoc(doc(fs, `${c}/${myId}`), { alias: myAlias })));
    },
  };

  return { db, user, myId, kind: 'firebase', alias } as RankingBackend & { alias: AliasApi };
}

let app: FirebaseApp | null = null;

/** Inicia Firebase y la sesión anónima. Si la sesión falla, el ranking queda de sólo lectura. */
export async function createFirebaseBackend(): Promise<RankingBackend | null> {
  try {
    app ??= initializeApp(FIREBASE_CONFIG);
    const fs = getFirestore(app);
    let myId: string | null = null;
    try {
      // Sin "popupRedirectResolver": no se carga ningún iframe ni script externo.
      const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
      await withTimeout(auth.authStateReady(), 8000);
      if (!auth.currentUser) await withTimeout(signInAnonymously(auth), 10_000);
      myId = auth.currentUser?.uid ?? null;
    } catch {
      myId = null;
    }
    return makeBackend(fs, myId);
  } catch {
    return null;
  }
}
