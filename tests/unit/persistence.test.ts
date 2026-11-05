import { describe, expect, it, beforeEach } from 'vitest';
import { loadProfile, saveProfile, mergeDefaults, STORAGE_KEY, clearAll, saveSession, loadSession } from '../../src/persistence/storage';
import { defaultProfile, STARTING_CHIPS } from '../../src/persistence/schema';

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe('Persistencia local', () => {
  it('sin datos devuelve el perfil por defecto con 10,000 fichas', () => {
    const p = loadProfile();
    expect(p.chips).toBe(STARTING_CHIPS);
    expect(p.onboardingDone).toBe(false);
  });

  it('guarda y recupera', () => {
    const p = defaultProfile();
    p.chips = 4321;
    p.settings.sound = true;
    p.stats.poker.hands = 7;
    expect(saveProfile(p)).toBe(true);
    const q = loadProfile();
    expect(q.chips).toBe(4321);
    expect(q.settings.sound).toBe(true);
    expect(q.stats.poker.hands).toBe(7);
  });

  it('tolera JSON corrupto y datos viejos o parciales', () => {
    localStorage.setItem(STORAGE_KEY, '{no es json');
    expect(loadProfile().chips).toBe(STARTING_CHIPS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chips: 50, settings: { sound: true } }));
    const p = loadProfile();
    expect(p.chips).toBe(50);
    expect(p.settings.sound).toBe(true);
    expect(p.settings.coach).toBe(true); // valor por defecto rellenado
    expect(p.stats.blackjack.rounds).toBe(0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chips: -10 }));
    expect(loadProfile().chips).toBe(0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chips: 'mucho' }));
    expect(loadProfile().chips).toBe(STARTING_CHIPS);
  });

  it('mergeDefaults conserva claves dinámicas (etiquetas de errores)', () => {
    const merged = mergeDefaults({ tags: {} as Record<string, number>, n: 1 }, { tags: { 'pago-sin-odds': 3 }, n: 2 });
    expect(merged.tags['pago-sin-odds']).toBe(3);
    expect(merged.n).toBe(2);
  });

  it('sesiones y borrado total', () => {
    saveSession('poker', { stack: 100 });
    expect(loadSession<{ stack: number }>('poker')!.stack).toBe(100);
    saveSession('poker', null);
    expect(loadSession('poker')).toBeNull();
    saveProfile(defaultProfile());
    clearAll();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
