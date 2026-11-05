import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadProfile, saveProfile, clearAll } from '../persistence/storage';
import { defaultProfile, HISTORY_LIMIT, STARTING_CHIPS, type SavedProfile, type Settings } from '../persistence/schema';
import { configureSound } from '../audio/sound';

interface ProfileApi {
  profile: SavedProfile;
  update: (fn: (draft: SavedProfile) => void) => void;
  updateSettings: (s: Partial<Settings>) => void;
  resetChips: () => void;
  resetEverything: () => void;
  storageOk: boolean;
}

const Ctx = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<SavedProfile>(() => loadProfile());
  const [storageOk, setStorageOk] = useState(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStorageOk(saveProfile(profile)), 150);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [profile]);

  // Guardar inmediatamente al ocultar la página.
  const latest = useRef(profile);
  latest.current = profile;
  useEffect(() => {
    const flush = () => saveProfile(latest.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  useEffect(() => {
    configureSound(profile.settings.sound, profile.settings.volume);
    const root = document.documentElement;
    root.dataset.motion = profile.settings.motion;
    root.dataset.fourColor = profile.settings.fourColorDeck ? 'on' : 'off';
  }, [profile.settings]);

  const update = useCallback((fn: (draft: SavedProfile) => void) => {
    setProfile((p) => {
      const d = structuredClone(p);
      fn(d);
      d.chips = Math.max(0, Math.floor(d.chips));
      d.history.poker = d.history.poker.slice(0, HISTORY_LIMIT);
      d.history.blackjack = d.history.blackjack.slice(0, HISTORY_LIMIT);
      d.history.roulette = d.history.roulette.slice(0, HISTORY_LIMIT);
      return d;
    });
  }, []);

  const api = useMemo<ProfileApi>(
    () => ({
      profile,
      update,
      storageOk,
      updateSettings: (s) => update((d) => Object.assign(d.settings, s)),
      resetChips: () =>
        update((d) => {
          d.chips = STARTING_CHIPS;
          d.resets++;
        }),
      resetEverything: () => {
        clearAll();
        setProfile({ ...defaultProfile(), onboardingDone: true });
      },
    }),
    [profile, update, storageOk],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile fuera del proveedor');
  return v;
}

/** ¿El usuario prefiere menos movimiento (ajuste o sistema)? */
export function useReducedMotion(): boolean {
  const { profile } = useProfile();
  const [sys, setSys] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const m = profile.settings.motion;
  return m === 'reduce' || (m === 'system' && sys);
}

export const uid = (): string => {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0]!.toString(36) + a[1]!.toString(36);
};
