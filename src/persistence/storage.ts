/**
 * Persistencia local (localStorage) con validación y migración defensiva.
 * Si el almacenamiento no está disponible (modo privado, bloqueado), la app
 * sigue funcionando en memoria.
 */
import { defaultProfile, SCHEMA_VERSION, type SavedProfile } from './schema';

export const STORAGE_KEY = 'casino-pepon:v1';
export const SESSION_KEY = 'casino-pepon:session:v1';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Mezcla profunda de un objeto guardado sobre los valores por defecto (tolerante a versiones viejas). */
function mergeDefaults<T>(def: T, saved: unknown): T {
  if (!isObject(def) || !isObject(saved)) {
    if (Array.isArray(def)) return (Array.isArray(saved) ? saved : def) as T;
    if (typeof def === typeof saved && saved !== null) return saved as T;
    return def;
  }
  const out: Record<string, unknown> = { ...def };
  for (const k of Object.keys(saved)) {
    const dv = (def as Record<string, unknown>)[k];
    const sv = saved[k];
    if (dv === undefined) out[k] = sv; // claves dinámicas (p. ej. tags)
    else out[k] = mergeDefaults(dv, sv);
  }
  return out as T;
}

export function loadProfile(): SavedProfile {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed: unknown = JSON.parse(raw);
    const p = mergeDefaults(defaultProfile(), parsed);
    p.version = SCHEMA_VERSION;
    if (!Number.isFinite(p.chips) || p.chips < 0) p.chips = 0;
    p.chips = Math.floor(p.chips);
    return p;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: SavedProfile): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function loadSession<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(`${SESSION_KEY}:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveSession(key: string, value: unknown): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(`${SESSION_KEY}:${key}`);
    else globalThis.localStorage?.setItem(`${SESSION_KEY}:${key}`, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: se ignora */
  }
}

export function clearAll(): void {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('casino-pepon:')) keys.push(k);
    }
    keys.forEach((k) => ls.removeItem(k));
  } catch {
    /* ignorar */
  }
}

export { mergeDefaults };
