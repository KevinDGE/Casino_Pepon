import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useProfile } from '../store';
import { getRankingBackend, publishMyTotals, subscribeRanking, type RankingBackend, type RankingRow } from '../../ranking/online';
import { currentTotals, periodKeys, type PeriodKind } from '../../ranking/periods';

export type SyncStatus = 'checking' | 'local' | 'synced' | 'pending' | 'readonly' | 'error';

let status: SyncStatus = 'checking';
const listeners = new Set<() => void>();
const setStatus = (s: SyncStatus) => { status = s; listeners.forEach((l) => l()); };
export const useSyncStatus = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);

export function useBackend(): RankingBackend | null | undefined {
  const [be, setBe] = useState<RankingBackend | null | undefined>(undefined);
  useEffect(() => { let on = true; void getRankingBackend().then((b) => { if (on) setBe(b); }); return () => { on = false; }; }, []);
  return be;
}

/** Publica tus acumulados en el ranking en línea cuando cambian (agrupando ráfagas). */
export function RankingSync() {
  const { profile } = useProfile();
  const be = useBackend();
  const last = useRef('');
  const writing = useRef<Promise<void>>(Promise.resolve());
  const readonly = useRef(false);
  const payload = JSON.stringify(profile.ranking);
  useEffect(() => {
    if (be === undefined) return;
    if (be === null) { setStatus('local'); return; }
    if (readonly.current) return;
    if (payload === last.current) { if (status === 'checking') setStatus('synced'); return; }
    if (profile.ranking.dayRounds + profile.ranking.monthRounds === 0 && !last.current) { setStatus('synced'); last.current = payload; return; }
    setStatus('pending');
    const t = window.setTimeout(() => {
      const body = JSON.parse(payload);
      writing.current = writing.current.then(async () => {
        const r = await publishMyTotals(be, body);
        if (r === 'ok') { last.current = payload; setStatus('synced'); }
        else if (r === 'readonly') { readonly.current = true; setStatus('readonly'); }
        else setStatus('error');
      });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [be, payload, profile.ranking.dayRounds, profile.ranking.monthRounds]);
  return null;
}

export interface RankingState {
  mode: 'loading' | 'local' | 'online';
  rows: RankingRow[];
  stale: boolean;
  error: string | null;
}

/** Top del periodo (suscripción en vivo) o, sin conexión a claude.ai, sólo tus datos. */
export function useRanking(kind: PeriodKind): RankingState {
  const be = useBackend();
  const [state, setState] = useState<RankingState>({ mode: 'loading', rows: [], stale: false, error: null });
  const key = periodKeys()[kind];
  useEffect(() => {
    if (be === undefined) return;
    if (be === null) { setState({ mode: 'local', rows: [], stale: false, error: null }); return; }
    setState((s) => ({ ...s, mode: 'loading', error: null }));
    let gotLive = false;
    const timer = window.setTimeout(() => { if (!gotLive) setState((s) => ({ ...s, stale: true })); }, 10_000);
    const unsub = subscribeRanking(
      be, kind, key,
      (rows, fromCache) => {
        if (!fromCache) { gotLive = true; window.clearTimeout(timer); }
        setState((s) => ({ mode: 'online', rows, stale: gotLive ? false : s.stale, error: null }));
      },
      (e) => { window.clearTimeout(timer); setState((s) => ({ ...s, mode: 'online', error: e.code })); },
    );
    return () => { window.clearTimeout(timer); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be, kind, key]);
  return state;
}

export function useMyTotals() {
  const { profile } = useProfile();
  return currentTotals(profile.ranking);
}
