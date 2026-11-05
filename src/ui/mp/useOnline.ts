import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfile, uid as newId } from '../store';
import { useAnnouncer } from '../announcer';
import { useBackend } from '../ranking/useRanking';
import { loadSession, saveSession } from '../../persistence/storage';
import { CryptoRng } from '../../core/rng';
import { generateKey, toHex, type SraKey } from '../../mp/sra';
import { fromAction, nextLineup, replayHand, type HostInfo, type Lineup, type PlayerDoc, type Replay } from '../../mp/protocol';
import { MyDocWriter, subscribeAll, subscribeTable } from '../../mp/transport';
import { requestMentalStep } from '../../workers/aiClient';
import { addResult } from '../../ranking/periods';
import type { PokerAction } from '../../engine/poker/types';
import { fmtChips } from '../../coach/format';
import { play } from '../../audio/sound';

export interface OnlineSession {
  tableId: string;
  hostId: string;
  buyIn: number;
  /** Mis fichas en la mesa al terminar la última mano en la que jugué. */
  stack: number;
  lastHand: number;
}

const AFK_MS = 50_000;
const rng = new CryptoRng();
const emptyDoc = (): PlayerDoc => ({ v: 1, table: null, seat: 0, joinedAt: 0, alive: 0, ready: 0, hostOpen: false, host: null, lineup: null, kicks: [], voided: [], h: null });

function loadKey(tableId: string, n: number): SraKey | null {
  try {
    const raw = localStorage.getItem(`casino-pepon:mpkey:${tableId}:${n}`);
    if (!raw) return null;
    const k = JSON.parse(raw) as { e: string; d: string };
    return { e: BigInt('0x' + k.e), d: BigInt('0x' + k.d) };
  } catch {
    return null;
  }
}
function storeKey(tableId: string, n: number, k: SraKey): void {
  try {
    localStorage.setItem(`casino-pepon:mpkey:${tableId}:${n}`, JSON.stringify({ e: toHex(k.e), d: toHex(k.d) }));
    localStorage.removeItem(`casino-pepon:mpkey:${tableId}:${n - 3}`);
  } catch {
    /* sin almacenamiento: la clave vive sólo en memoria */
  }
}

export function useOnline() {
  const { profile, update } = useProfile();
  const { toast, announce } = useAnnouncer();
  const be = useBackend();
  const me = be?.myId ?? null;
  const [session, setSessionState] = useState<OnlineSession | null>(() => loadSession<OnlineSession>('online'));
  const [lobby, setLobby] = useState<Record<string, PlayerDoc>>({});
  const [table, setTable] = useState<Record<string, PlayerDoc>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [myVersion, setMyVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const myDoc = useRef<PlayerDoc>(emptyDoc());
  const loadedMine = useRef(false);
  const writer = useRef<MyDocWriter | null>(null);
  const keys = useRef(new Map<number, SraKey>());
  const inflight = useRef(new Set<string>());
  const settled = useRef(new Set<number>());
  const hostScheduled = useRef<string>('');

  const setSession = useCallback((s: OnlineSession | null) => {
    setSessionState(s);
    saveSession('online', s);
  }, []);

  useEffect(() => {
    if (!be) return;
    writer.current = new MyDocWriter(be);
    writer.current.onError = (code) => setError(code === 'invalid_argument' ? 'readonly' : code);
  }, [be]);

  const writeMe = useCallback((mut: (d: PlayerDoc) => void) => {
    const d = structuredClone(myDoc.current);
    mut(d);
    myDoc.current = d;
    setMyVersion((v) => v + 1);
    writer.current?.write(d);
  }, []);

  // Suscripciones: lobby (sin mesa) o mi mesa.
  useEffect(() => {
    if (!be) return;
    const onErr = (code: string) => setError(code);
    if (!session) return subscribeAll(be, setLobby, onErr);
    return subscribeTable(be, session.tableId, (docs) => {
      setTable(docs);
      if (!loadedMine.current && be.myId && docs[be.myId]) {
        myDoc.current = docs[be.myId]!;
        loadedMine.current = true;
        setMyVersion((v) => v + 1);
      }
    }, onErr);
  }, [be, session?.tableId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reloj para tiempos de espera y presencia.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  // Latido de presencia mientras estoy en una mesa.
  useEffect(() => {
    if (!session || !me) return;
    const beat = () => writeMe((d) => { d.alive = Date.now(); });
    const t = window.setInterval(beat, 20_000);
    return () => window.clearInterval(t);
  }, [session, me, writeMe]);

  // Nombres (se resuelven al mostrar; nunca se guardan).
  useEffect(() => {
    if (!be) return;
    const ids = Object.keys(session ? table : lobby);
    if (!ids.length) return;
    void be.user.profiles(ids).then((ps) => {
      setNames(Object.fromEntries(ids.map((id) => [id, id === be.myId ? 'Tú' : ps[id]?.name || 'Jugador'])));
    });
  }, [be, table, lobby, session]);

  const docs = useMemo(() => (me ? { ...table, [me]: myDoc.current } : table), [table, me, myVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const hostDoc = session ? docs[session.hostId] ?? null : null;
  const lineup: Lineup | null = hostDoc?.lineup ?? null;
  const inLineup = !!(lineup && me && lineup.players.includes(me));

  const keyFor = useCallback((n: number): SraKey | null => {
    if (!session) return null;
    let k = keys.current.get(n) ?? loadKey(session.tableId, n);
    if (!k) {
      k = generateKey(rng);
      storeKey(session.tableId, n, k);
    }
    keys.current.set(n, k);
    return k;
  }, [session]);

  const replay: Replay | null = useMemo(() => {
    if (!session || !me || !lineup) return null;
    return replayHand(lineup, docs, hostDoc, me, inLineup ? keyFor(lineup.n) : null);
  }, [session, me, lineup, docs, hostDoc, inLineup, keyFor]);

  // Al empezar una mano en la que estoy: preparar mis mensajes.
  useEffect(() => {
    if (!lineup || !inLineup) return;
    if (myDoc.current.h?.n !== lineup.n) writeMe((d) => { d.h = { n: lineup.n, acts: [] }; });
  }, [lineup, inLineup, writeMe]);

  // Pasos criptográficos que me tocan (en el Web Worker).
  useEffect(() => {
    if (!replay || !me || !lineup || myDoc.current.h?.n !== lineup.n) return;
    const p = replay.pending;
    const mine = (p.kind === 'shuffle' || p.kind === 'hole' || p.kind === 'reveal') ? p.who === me : p.kind === 'showdown' ? p.who.includes(me) : false;
    if (!mine) return;
    const tag = `${lineup.n}:${p.kind}:${p.kind === 'reveal' ? p.street : ''}`;
    if (inflight.current.has(tag)) return;
    inflight.current.add(tag);
    const key = keyFor(lineup.n)!;
    void requestMentalStep(p, me, toHex(key.e), toHex(key.d)).then((patch) => {
      if (!patch) return;
      writeMe((d) => {
        if (!d.h || d.h.n !== lineup.n) return;
        d.h = { ...d.h, ...patch, rv: { ...(d.h.rv ?? {}), ...(patch.rv ?? {}) } };
      });
      if (p.kind === 'shuffle') play('shuffle');
    }).catch(() => inflight.current.delete(tag));
  }, [replay, me, lineup, keyFor, writeMe]);

  // Fin de mano: mis fichas, ranking, historial y listo para la siguiente.
  useEffect(() => {
    if (!replay || !lineup || !session || !me) return;
    const k = replay.pending.kind;
    if (k !== 'done' && k !== 'void') return;
    if (settled.current.has(lineup.n)) return;
    settled.current.add(lineup.n);
    if (inLineup) {
      const seat = lineup.players.indexOf(me);
      const before = lineup.stacks[seat]!;
      const after = k === 'done' ? replay.state!.players[seat]!.stack : before;
      const net = after - before;
      if (lineup.n > session.lastHand) {
        update((d) => {
          d.ranking = addResult(d.ranking, net);
          d.history.arcade.unshift({ id: newId(), ts: Date.now(), game: 'online', summary: k === 'void' ? `Mano ${lineup.n} anulada` : `Mano ${lineup.n} en línea`, wagered: 0, net });
        });
        setSession({ ...session, stack: after, lastHand: lineup.n });
        if (k === 'done') { if (net > 0) play('win'); announce(net > 0 ? `Ganas ${fmtChips(net)}.` : net < 0 ? `Pierdes ${fmtChips(-net)}.` : 'Mano terminada.'); }
        else toast('La mano se anuló: nadie gana ni pierde fichas.');
      }
      if (after <= 0) {
        toast('Te quedaste sin fichas en la mesa.');
        return;
      }
    }
    writeMe((d) => { d.ready = Math.max(d.ready, lineup.n + 1); });
  }, [replay, lineup, inLineup, session, me, update, setSession, writeMe, toast, announce]);

  // Si llego a una mesa ya empezada, quedo listo para la siguiente mano.
  useEffect(() => {
    if (!session || !me || !loadedMine.current) return;
    const want = (lineup?.n ?? 0) + 1;
    if (!inLineup && myDoc.current.ready < want && session.stack > 0) writeMe((d) => { d.ready = want; });
  }, [session, me, lineup, inLineup, writeMe, myVersion]);

  // Quien hospeda: arma la siguiente alineación y atiende ausencias.
  const isHost = !!(session && me && session.hostId === me);
  const seatedKey = JSON.stringify(
    Object.entries(docs)
      .filter(([, d]) => session && d.table === session.tableId && now - (d.alive || 0) < AFK_MS + 20_000)
      .map(([id, d]) => ({ uid: id, seat: d.seat, ready: d.ready }))
      .sort((a, b) => a.seat - b.seat),
  );
  // Referencia estable mientras no cambie quién está sentado (evita reiniciar temporizadores).
  const seated = useMemo(() => JSON.parse(seatedKey) as { uid: string; seat: number; ready: number }[], [seatedKey]);
  useEffect(() => {
    if (!isHost || !session || !replay || !lineup) return;
    const k = replay.pending.kind;
    if (k !== 'done' && k !== 'void') return;
    const n = lineup.n + 1;
    const tag = `${n}`;
    if (hostScheduled.current === tag) return;
    const host = myDoc.current.host!;
    const everyone = seated.filter((p) => p.ready >= n);
    const allReady = everyone.length === seated.length;
    const delay = allReady ? 1800 : 9000;
    const t = window.setTimeout(() => {
      const next = nextLineup(lineup, k === 'done' ? replay.state!.players.map((p) => p.stack) : null, seated, host, n);
      if (!next) return;
      hostScheduled.current = tag;
      writeMe((d) => { d.lineup = next; });
    }, delay);
    return () => window.clearTimeout(t);
  }, [isHost, session, replay, lineup, seated, writeMe]);

  useEffect(() => {
    if (!isHost || !replay || !lineup) return;
    const p = replay.pending;
    const who = p.kind === 'act' || p.kind === 'shuffle' || p.kind === 'hole' || p.kind === 'reveal' ? [p.who] : p.kind === 'showdown' ? p.who : [];
    const gone = who.filter((u) => u !== me && now - (docs[u]?.alive || 0) > AFK_MS);
    if (!gone.length) return;
    if (p.kind === 'act') {
      writeMe((d) => { d.kicks = [...(d.kicks ?? []).filter((x) => x.n >= lineup.n - 2), { n: lineup.n, s: p.seq }]; });
      toast(`${names[p.who] || 'Un jugador'} no respondió: se retira de la mano.`);
    } else {
      writeMe((d) => { d.voided = [...(d.voided ?? []).filter((x) => x >= lineup.n - 5), lineup.n]; });
    }
  }, [isHost, replay, lineup, now, docs, me, writeMe, toast, names]);

  // La mesa se cerró (quien hospeda se fue).
  const tableClosed = !!(session && Object.keys(table).length > 0 && (!hostDoc || hostDoc.table !== session.tableId));

  const credit = useCallback((amount: number, net: number) => {
    update((d) => {
      d.chips += Math.max(0, Math.floor(amount));
      if (net) d.ranking = addResult(d.ranking, net);
    });
  }, [update]);

  const leave = useCallback(() => {
    if (!session) return;
    let stack = session.stack;
    let net = 0;
    if (replay && lineup && inLineup && me && replay.pending.kind !== 'done' && replay.pending.kind !== 'void' && lineup.n > session.lastHand) {
      // Salir a mitad de mano equivale a retirarse: se pierde lo ya apostado.
      const seat = lineup.players.indexOf(me);
      const st = replay.state?.players[seat]?.stack ?? lineup.stacks[seat]!;
      net = st - lineup.stacks[seat]!;
      stack = tableClosed ? lineup.stacks[seat]! : st;
      if (tableClosed) net = 0;
    }
    credit(stack, net);
    writeMe((d) => { Object.assign(d, emptyDoc(), { alive: Date.now() }); });
    setSession(null);
    setTable({});
    loadedMine.current = false;
    settled.current.clear();
    inflight.current.clear();
  }, [session, replay, lineup, inLineup, me, tableClosed, credit, writeMe, setSession]);

  const createTable = useCallback((info: Omit<HostInfo, 'tableId' | 'createdAt'>) => {
    if (!me || profile.chips < info.buyIn) return false;
    const tableId = `${me}.${Date.now().toString(36)}`;
    const host: HostInfo = { ...info, tableId, createdAt: Date.now() };
    update((d) => { d.chips -= info.buyIn; });
    myDoc.current = { ...emptyDoc(), table: tableId, seat: 0, joinedAt: Date.now(), alive: Date.now(), ready: 1, hostOpen: true, host };
    loadedMine.current = true;
    writer.current?.write(myDoc.current);
    setMyVersion((v) => v + 1);
    setSession({ tableId, hostId: me, buyIn: info.buyIn, stack: info.buyIn, lastHand: 0 });
    return true;
  }, [me, profile.chips, update, setSession]);

  const join = useCallback((hostId: string, host: HostInfo, taken: number[]) => {
    if (!me || profile.chips < host.buyIn) return false;
    const seat = Array.from({ length: host.maxSeats }, (_, i) => i).find((i) => !taken.includes(i));
    if (seat === undefined) return false;
    update((d) => { d.chips -= host.buyIn; });
    const hostLineupN = lobby[hostId]?.lineup?.n ?? 0;
    myDoc.current = { ...emptyDoc(), table: host.tableId, seat, joinedAt: Date.now(), alive: Date.now(), ready: hostLineupN + 1 };
    loadedMine.current = true;
    writer.current?.write(myDoc.current);
    setMyVersion((v) => v + 1);
    setSession({ tableId: host.tableId, hostId, buyIn: host.buyIn, stack: host.buyIn, lastHand: hostLineupN });
    return true;
  }, [me, profile.chips, update, lobby, setSession]);

  /** Quien hospeda reparte la primera mano. */
  const startFirstHand = useCallback(() => {
    if (!isHost) return;
    const next = nextLineup(null, null, seated, myDoc.current.host!, 1);
    if (next) writeMe((d) => { d.lineup = next; });
  }, [isHost, seated, writeMe]);

  const act = useCallback((a: PokerAction) => {
    if (!replay || replay.pending.kind !== 'act' || replay.pending.who !== me || !lineup) return;
    const seq = replay.pending.seq;
    writeMe((d) => {
      if (!d.h || d.h.n !== lineup.n || d.h.acts.some((x) => x.s === seq)) return;
      d.h.acts = [...d.h.acts, fromAction(a, seq)];
    });
    play(a.type === 'fold' || a.type === 'check' ? 'click' : 'chip');
  }, [replay, me, lineup, writeMe]);

  // Mi asiento choca con otro (dos personas se sentaron a la vez): elijo otro libre.
  useEffect(() => {
    if (!session || !me || !hostDoc?.host) return;
    const mine = myDoc.current;
    if (mine.table !== session.tableId) return;
    const clash = Object.entries(table).some(([id, d]) => id !== me && d.table === session.tableId && d.seat === mine.seat && (d.joinedAt < mine.joinedAt || (d.joinedAt === mine.joinedAt && id < me)));
    if (!clash) return;
    const taken = Object.values(table).filter((d) => d.table === session.tableId).map((d) => d.seat);
    const free = Array.from({ length: hostDoc.host.maxSeats }, (_, i) => i).find((i) => !taken.includes(i));
    if (free !== undefined) writeMe((d) => { d.seat = free; });
  }, [table, session, me, hostDoc, writeMe]);

  return {
    available: be === undefined ? 'loading' : be === null ? 'no' : me ? 'yes' : 'signedout',
    me, session, lobby, table: docs, names, lineup, replay, hostDoc, isHost, seated, tableClosed, error,
    createTable, join, leave, act, startFirstHand,
  } as const;
}
