import { useCallback, useEffect, useRef, useState } from 'react';
import { CryptoRng, randomInt, shuffleInPlace } from '../../core/rng';
import { cardLabel } from '../../core/cards';
import { applyAction, cloneState, createGame, startHand } from '../../engine/poker/game';
import type { PokerAction, PokerState } from '../../engine/poker/types';
import { getPlayerView } from '../../engine/poker/view';
import { LEVEL_NAMES_ES, newMemory, type BotMemory, type PokerLevel } from '../../ai/poker/bots';
import { observeHand, type ModelStore } from '../../ai/poker/opponentModel';
import { RIVALS, rivalById } from '../../ai/poker/profiles';
import { gradeDecision, type DecisionRecord, type PokerAdvice } from '../../coach/pokerCoach';
import { fmtChips } from '../../coach/format';
import { requestBotAction, requestCoach } from '../../workers/aiClient';
import { loadSession, saveSession } from '../../persistence/storage';
import type { PokerSetup } from '../../persistence/schema';
import { useProfile, uid } from '../store';
import { useAnnouncer } from '../announcer';
import { play, vibrate } from '../../audio/sound';

export interface SeatMeta {
  id: string;
  name: string;
  isHuman: boolean;
  level?: PokerLevel;
  profileId?: string;
}

export interface PokerSession {
  version: 1;
  setup: PokerSetup;
  seats: SeatMeta[];
  stacks: number[];
  button: number;
  handNumber: number;
  models: ModelStore;
  memories: Record<string, BotMemory>;
  buyIn: number;
  /** Fichas totales que la persona ha metido en esta mesa (buy-in + recompras). */
  invested: number;
}

const HUMAN_ID = 'tu';
const rng = new CryptoRng();
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const SPEED_MS = { calm: 1400, normal: 850, fast: 320 } as const;
const BOT_ITERS: Record<PokerLevel, number> = { beginner: 0, intermediate: 0, advanced: 500, expert: 1200 };

export function actionText(name: string, kind: string, to: number, amount: number, isHuman: boolean): string {
  const verb = (h: string, o: string) => (isHuman ? h : o);
  switch (kind) {
    case 'fold': return `${name} ${verb('te retiras', 'se retira')}`;
    case 'check': return `${name} ${verb('pasas', 'pasa')}`;
    case 'call': return `${name} ${verb('igualas', 'iguala')} ${fmtChips(amount)}`;
    case 'bet': return `${name} ${verb('apuestas', 'apuesta')} ${fmtChips(to)}`;
    case 'raise': return `${name} ${verb('subes', 'sube')} a ${fmtChips(to)}`;
    case 'allin': return `${name} ${verb('vas', 'va')} all-in (${fmtChips(to)})`;
    default: return name;
  }
}

/** Convierte el registro de la mano en líneas legibles. */
export function handLines(state: PokerState): string[] {
  const name = (s: number) => (state.players[s]!.isHuman ? 'Tú' : state.players[s]!.name);
  const out: string[] = [];
  for (const e of state.log) {
    switch (e.t) {
      case 'post': out.push(`${name(e.seat)}: ciega ${e.blind === 'SB' ? 'pequeña' : 'grande'} ${fmtChips(e.amount)}`); break;
      case 'action': out.push(actionText(name(e.seat), e.kind, e.to, e.amount, state.players[e.seat]!.isHuman)); break;
      case 'street': out.push(`${e.street === 'flop' ? 'Flop' : e.street === 'turn' ? 'Turn' : 'River'}: ${e.board.map(cardLabel).join(' ')}`); break;
      case 'refund': out.push(`Se devuelven ${fmtChips(e.amount)} no igualadas a ${name(e.seat)}`); break;
      case 'show': out.push(`${name(e.seat)} ${state.players[e.seat]!.isHuman ? 'muestras' : 'muestra'} ${e.hole.map(cardLabel).join(' ')} — ${e.desc}`); break;
      case 'win': out.push(`${name(e.seat)} ${state.players[e.seat]!.isHuman ? 'ganas' : 'gana'} ${fmtChips(e.amount)}${e.desc ? ` con ${e.desc.toLowerCase()}` : ''}`); break;
      case 'eliminated': out.push(`${name(e.seat)} ${state.players[e.seat]!.isHuman ? 'quedas eliminado' : 'queda eliminado'}`); break;
      default: break;
    }
  }
  return out;
}

export function usePokerTable() {
  const { profile, update } = useProfile();
  const { announce } = useAnnouncer();
  const [session, setSession] = useState<PokerSession | null>(() => loadSession<PokerSession>('poker'));
  const [state, setState] = useState<PokerState | null>(null);
  const [thinking, setThinking] = useState<number | null>(null);
  const [advice, setAdvice] = useState<PokerAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [review, setReview] = useState<DecisionRecord[] | null>(null);
  const stateRef = useRef<PokerState | null>(null);
  const sessionRef = useRef<PokerSession | null>(session);
  const gen = useRef(0);
  const adviceKey = useRef<string>('');
  const adviceRef = useRef<PokerAdvice | null>(null);
  const decisions = useRef<DecisionRecord[]>([]);
  const processedHand = useRef<number>(-1);
  const settings = profile.settings;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  stateRef.current = state;
  sessionRef.current = session;

  const persist = useCallback((s: PokerSession | null) => {
    sessionRef.current = s;
    setSession(s);
    saveSession('poker', s);
  }, []);

  const keyOf = (s: PokerState) => `${s.handNumber}:${s.log.length}`;

  /** Crea el estado de juego a partir de la sesión guardada (al inicio de una mano). */
  const buildGame = useCallback((s: PokerSession): PokerState => {
    const g = createGame(
      { smallBlind: s.setup.bigBlind / 2, bigBlind: s.setup.bigBlind, blindIncreaseEvery: s.setup.blindIncreaseEvery },
      s.seats.map((m, i) => ({ id: m.id, name: m.name, isHuman: m.isHuman, stack: s.stacks[i]! })),
      0,
    );
    g.button = s.button;
    g.handNumber = s.handNumber;
    return g;
  }, []);

  const dealNext = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const g = buildGame(s);
    if (g.players[0]!.out) return;
    startHand(g, rng);
    gen.current++;
    decisions.current = [];
    setReview(null);
    setAdvice(null);
    adviceRef.current = null;
    adviceKey.current = '';
    play('shuffle');
    setState(g);
    if (g.phase === 'betting') announce(`Mano ${g.handNumber}. Tus cartas: ${g.players[0]!.hole.map(cardLabel).join(' y ')}.`);
  }, [buildGame, announce]);

  const createTable = useCallback((setup: PokerSetup) => {
    const buyIn = setup.buyInBB * setup.bigBlind;
    if (profile.chips < buyIn) return false;
    const pool = shuffleInPlace([...RIVALS], rng).slice(0, setup.rivals);
    const mixed: PokerLevel[] = shuffleInPlace(['expert', 'advanced', 'intermediate', 'beginner', 'expert', 'advanced'] as PokerLevel[], rng);
    const seats: SeatMeta[] = [
      { id: HUMAN_ID, name: 'Tú', isHuman: true },
      ...pool.map((r, i) => ({ id: r.id, name: r.name, isHuman: false, level: setup.level === 'mixed' ? mixed[i]! : setup.level, profileId: r.id })),
    ];
    const memories: Record<string, BotMemory> = {};
    for (const m of seats) if (!m.isHuman) memories[m.id] = newMemory();
    const n = seats.length;
    const s: PokerSession = {
      version: 1, setup, seats, stacks: seats.map(() => buyIn),
      button: randomInt(rng, n), handNumber: 0, models: {}, memories, buyIn, invested: buyIn,
    };
    update((d) => {
      d.chips -= buyIn;
      d.pokerSetup = setup;
      d.stats.poker.tablesPlayed++;
    });
    persist(s);
    processedHand.current = -1;
    window.setTimeout(dealNext, 50);
    return true;
  }, [profile.chips, update, persist, dealNext]);

  // Reanudar una mesa guardada.
  useEffect(() => {
    if (session && !state) {
      const g = buildGame(session);
      setState(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaveTable = useCallback(() => {
    const s = sessionRef.current;
    gen.current++;
    if (s) {
      const st = stateRef.current;
      // Si la mano está en curso, se devuelve el stack al inicio de la mano (la mano se anula).
      const stack = st && st.phase === 'betting' ? st.startStacks[0] ?? s.stacks[0]! : st ? st.players[0]!.stack : s.stacks[0]!;
      update((d) => { d.chips += stack; });
    }
    persist(null);
    setState(null);
    setThinking(null);
    setAdvice(null);
    setReview(null);
  }, [persist, update]);

  const rebuy = useCallback(() => {
    const s = sessionRef.current;
    if (!s || profile.chips < s.buyIn) return false;
    const stacks = [...s.stacks];
    stacks[0] = s.buyIn;
    update((d) => { d.chips -= s.buyIn; });
    persist({ ...s, stacks, invested: s.invested + s.buyIn });
    window.setTimeout(dealNext, 30);
    return true;
  }, [profile.chips, persist, update, dealNext]);

  /** Procesa el final de una mano: modelos, estadísticas, historial y sesión. */
  const finishHand = useCallback((g: PokerState) => {
    const s = sessionRef.current;
    if (!s || processedHand.current === g.handNumber || !g.result) return;
    processedHand.current = g.handNumber;
    const ids = g.players.map((p) => p.id);
    const models = structuredClone(s.models);
    observeHand(models, g.log, ids);
    const net = g.result.net[0] ?? 0;
    const pot = g.result.pots.reduce((a, p) => a + p.amount, 0);
    const recs = decisions.current;
    const human = g.players[0]!;
    const vpip = g.log.some((e) => e.t === 'action' && e.seat === 0 && e.street === 'preflop' && (e.kind === 'call' || e.kind === 'raise' || e.kind === 'bet' || e.kind === 'allin'));
    const pfr = g.log.some((e) => e.t === 'action' && e.seat === 0 && e.street === 'preflop' && (e.kind === 'raise' || e.kind === 'allin'));
    const humanShowed = g.result.showdown && g.revealed.includes(0);
    const humanWonSD = humanShowed && g.result.pots.some((p) => p.winners.includes(0));
    const wonTable = g.phase === 'gameOver' && !human.out;
    const winners = [...new Set(g.result.pots.flatMap((p) => p.winners))].map((x) => (g.players[x]!.isHuman ? 'Tú' : g.players[x]!.name));
    const lines = handLines(g);
    update((d) => {
      const st = d.stats.poker;
      st.hands++;
      if (net > 0) st.handsWon++;
      st.net += net;
      st.biggestPot = Math.max(st.biggestPot, pot);
      if (vpip) st.vpip++;
      if (pfr) st.pfr++;
      if (humanShowed) st.showdowns++;
      if (humanWonSD) st.showdownsWon++;
      for (const r of recs) {
        st.decisions++;
        if (r.grade === 'acierto') st.good++;
        else if (r.grade === 'imprecision') st.inaccuracies++;
        else st.errors++;
        st.evLossBB += r.evLossBB;
        for (const t of r.tags) st.tags[t] = (st.tags[t] ?? 0) + 1;
      }
      if (wonTable) st.tablesWon++;
      d.history.poker.unshift({
        id: uid(), ts: Date.now(), hand: g.handNumber, hole: human.hole, board: g.board, net, pot,
        summary: `${winners.join(' y ')} ${winners.length > 1 ? 'ganan' : winners[0] === 'Tú' ? 'ganas' : 'gana'} · bote ${fmtChips(pot)}`,
        lines, review: recs.map((r) => ({ grade: r.grade, comment: r.comment })),
      });
    });
    const next: PokerSession = { ...s, models, stacks: g.players.map((p) => p.stack), button: g.button, handNumber: g.handNumber };
    persist(next);
    if (recs.length) setReview(recs);
    if (net > 0) { play('win'); vibrate(30, settingsRef.current.haptics); }
    announce(net > 0 ? `Ganas ${fmtChips(net)} fichas.` : net < 0 ? `Pierdes ${fmtChips(-net)} fichas.` : 'Mano terminada.');
  }, [update, persist, announce]);

  // Motor de turnos: IA y coach.
  useEffect(() => {
    const g = state;
    const s = session;
    if (!g || !s) return;
    if (g.phase === 'handOver' || g.phase === 'gameOver') {
      finishHand(g);
      return;
    }
    if (g.phase !== 'betting' || g.toAct === null) return;
    const seat = g.toAct;
    const meta = s.seats[seat]!;
    const myGen = gen.current;
    if (meta.isHuman) {
      setThinking(null);
      play('turn');
      const key = keyOf(g);
      if (settingsRef.current.coach && adviceKey.current !== key) {
        adviceKey.current = key;
        setAdviceLoading(true);
        setAdvice(null);
        adviceRef.current = null;
        const view = getPlayerView(g, seat);
        requestCoach({ type: 'pokerCoach', view, models: s.models, iterations: 2500 })
          .then((a) => {
            if (gen.current !== myGen || adviceKey.current !== key) return;
            adviceRef.current = a;
            setAdvice(a);
          })
          .catch(() => undefined)
          .finally(() => {
            if (adviceKey.current === key) setAdviceLoading(false);
          });
      }
      return;
    }
    setThinking(seat);
    const view = getPlayerView(g, seat);
    const level = meta.level ?? 'expert';
    const style = meta.profileId ? rivalById(meta.profileId).style : undefined;
    const delay = SPEED_MS[settingsRef.current.speed] * (0.75 + Math.random() * 0.5);
    let cancelled = false;
    void Promise.all([
      requestBotAction({ type: 'pokerBot', view, level, style, models: s.models, memory: s.memories[meta.id] ?? newMemory(), iterations: BOT_ITERS[level] }),
      sleep(delay),
    ]).then(([res]) => {
      if (cancelled || gen.current !== myGen || stateRef.current !== g) return;
      const next = cloneState(g);
      try {
        applyAction(next, res.action);
      } catch {
        // Respaldo defensivo: nunca debería ocurrir porque la IA sanea sus acciones.
        const l = getPlayerView(next, seat).legal;
        applyAction(next, l.canCheck ? { type: 'check' } : { type: 'fold' });
      }
      const ss = sessionRef.current;
      if (ss) {
        const updated = { ...ss, memories: { ...ss.memories, [meta.id]: res.memory } };
        sessionRef.current = updated;
        setSession(updated);
      }
      const ev = next.log.filter((e) => e.t === 'action').pop();
      if (ev && ev.t === 'action') {
        announce(actionText(meta.name, ev.kind, ev.to, ev.amount, false));
        play(ev.kind === 'fold' || ev.kind === 'check' ? 'click' : 'chip');
      }
      if (next.board.length > g.board.length) play('card');
      setThinking(null);
      setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [state, session?.seats, finishHand, settings.coach]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reparto automático opcional.
  useEffect(() => {
    if (!state || state.phase !== 'handOver' || !settings.autoNextHand) return;
    const t = window.setTimeout(dealNext, 3500);
    return () => window.clearTimeout(t);
  }, [state, settings.autoNextHand, dealNext]);

  const act = useCallback((action: PokerAction) => {
    const g = stateRef.current;
    if (!g || g.phase !== 'betting' || g.toAct !== 0) return;
    const a = adviceRef.current;
    if (a && adviceKey.current === keyOf(g)) decisions.current.push(gradeDecision(a, action));
    const next = cloneState(g);
    applyAction(next, action);
    const ev = next.log.filter((e) => e.t === 'action').pop();
    if (ev && ev.t === 'action') play(ev.kind === 'fold' || ev.kind === 'check' ? 'click' : 'chip');
    vibrate(12, settingsRef.current.haptics);
    setAdvice(null);
    setAdviceLoading(false);
    adviceRef.current = null;
    setState(next);
  }, []);

  const humanOut = !!state && state.players[0]!.out;
  const tableWon = !!state && state.phase === 'gameOver' && !humanOut;

  // Al ganar la mesa, las fichas vuelven al saldo.
  const cashOut = useCallback(() => {
    leaveTable();
  }, [leaveTable]);

  return {
    session, state, thinking, advice, adviceLoading, review, setReview,
    createTable, dealNext, act, leaveTable, rebuy, cashOut, humanOut, tableWon,
    levelName: (seat: number) => {
      const m = session?.seats[seat];
      return m?.level ? LEVEL_NAMES_ES[m.level] : '';
    },
  };
}
