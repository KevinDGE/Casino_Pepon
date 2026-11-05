import { useCallback, useEffect, useRef, useState } from 'react';
import { CryptoRng } from '../../core/rng';
import {
  applyBJAction,
  blackjackView,
  cardsRemaining,
  createBlackjack,
  decideInsurance,
  getLegal,
  maxInsurance,
  reshuffle,
  seatRoundNet,
  startRound,
} from '../../engine/blackjack/game';
import type { BJAction, BJState, BlackjackRules } from '../../engine/blackjack/types';
import { decideBJ, decideInsuranceAI, type BJLevel } from '../../ai/blackjack/strategy';
import {
  bjAdvice,
  bjInsuranceAdvice,
  gradeBJ,
  gradeInsurance,
  type BJAdvice,
  type BJDecision,
  type InsuranceAdvice,
} from '../../coach/blackjackCoach';
import { RIVALS } from '../../ai/poker/profiles';
import { useProfile, uid } from '../store';
import { useAnnouncer } from '../announcer';
import { play, vibrate } from '../../audio/sound';
import { fmtChips } from '../../coach/format';
import { handTotal } from '../../engine/blackjack/hand';
import { addResult } from '../../ranking/periods';

const rng = new CryptoRng();
const SPEED_MS = { calm: 1100, normal: 700, fast: 260 } as const;
const COMPANION_BANK = 1_000_000_000;
export const MIN_BET = 5;
export const MAX_BET = 5000;

export interface Companion {
  name: string;
  level: BJLevel;
  colors: [string, string];
  initials: string;
}

function seatsFor(companions: number, level: BJLevel) {
  const profs = RIVALS.slice(2, 2 + companions);
  const comps: Companion[] = profs.map((p) => ({ name: p.name, level, colors: p.colors, initials: p.initials }));
  const order: ('human' | Companion)[] =
    companions === 0 ? ['human'] : companions === 1 ? ['human', comps[0]!] : [comps[0]!, 'human', comps[1]!];
  return order;
}

export function useBlackjack() {
  const { profile, update } = useProfile();
  const { announce, toast } = useAnnouncer();
  const setup = profile.blackjackSetup;
  const [layout, setLayout] = useState(() => seatsFor(setup.companions, setup.companionLevel));
  const humanIdx = layout.indexOf('human');
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [state, setState] = useState<BJState>(() =>
    createBlackjack(
      setup.rules,
      layout.map((x, i) => ({
        id: x === 'human' ? 'tu' : `c${i}`,
        name: x === 'human' ? 'Tú' : x.name,
        isHuman: x === 'human',
        bankroll: x === 'human' ? profile.chips : COMPANION_BANK,
      })),
      rng,
    ),
  );
  const [bet, setBet] = useState(() => Math.min(profile.lastBets.blackjack || 100, Math.max(MIN_BET, profile.chips)));
  const [advice, setAdvice] = useState<BJAdvice | null>(null);
  const [insAdvice, setInsAdvice] = useState<InsuranceAdvice | null>(null);
  const [lastReview, setLastReview] = useState<BJDecision[]>([]);
  const decisions = useRef<BJDecision[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const settled = useRef(-1);
  const speed = SPEED_MS[profile.settings.speed];

  const commit = useCallback((s: BJState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  /** Aplica nuevas reglas o compañeros (sólo entre rondas). */
  const applySetup = useCallback(
    (rules: BlackjackRules, companions: number, level: BJLevel) => {
      const lay = seatsFor(companions, level);
      setLayout(lay);
      const s = createBlackjack(
        rules,
        lay.map((x, i) => ({
          id: x === 'human' ? 'tu' : `c${i}`,
          name: x === 'human' ? 'Tú' : x.name,
          isHuman: x === 'human',
          bankroll: x === 'human' ? profile.chips : COMPANION_BANK,
        })),
        rng,
      );
      update((d) => {
        d.blackjackSetup = { rules, companions, companionLevel: level };
      });
      commit(s);
      toast('Nuevas reglas aplicadas: zapato barajado.');
    },
    [commit, profile.chips, update, toast],
  );

  const deal = useCallback(() => {
    const cur = stateRef.current;
    if (cur.phase !== 'betting' && cur.phase !== 'settled') return;
    const amount = Math.floor(bet);
    if (amount < MIN_BET || amount > profile.chips) return;
    const s = structuredClone(cur);
    s.seats.forEach((seat) => {
      if (seat.isHuman) seat.bankroll = profile.chips;
      else seat.bankroll = COMPANION_BANK;
    });
    const before = s.pos;
    const reshuffled = s.pos >= s.cut;
    startRound(
      s,
      s.seats.map((seat) => (seat.isHuman ? amount : 100)),
      rng,
    );
    if (reshuffled || s.pos < before) {
      play('shuffle');
      toast('Se barajó un zapato nuevo.');
    }
    decisions.current = [];
    setLastReview([]);
    // La apuesta se descuenta al repartir; al liquidar se acredita el saldo final de la ronda.
    update((d) => {
      d.lastBets.blackjack = amount;
      d.chips -= amount;
    });
    play('card');
    commit(s);
  }, [bet, profile.chips, commit, update, toast]);

  const processSettlement = useCallback(
    (s: BJState) => {
      if (settled.current === s.round) return;
      settled.current = s.round;
      const h = s.seats[humanIdx]!;
      const net = seatRoundNet(h);
      const wagered = h.hands.reduce((a, x) => a + x.bet, 0) + h.insurance;
      const recs = decisions.current;
      setLastReview(recs);
      update((d) => {
        d.chips = h.bankroll;
        d.ranking = addResult(d.ranking, net);
        const st = d.stats.blackjack;
        st.rounds++;
        st.net += net;
        st.wagered += wagered;
        for (const x of h.hands) {
          if (x.outcome === 'blackjack') {
            st.blackjacks++;
            st.wins++;
          } else if (x.outcome === 'win') st.wins++;
          else if (x.outcome === 'push') st.pushes++;
          else st.losses++;
        }
        for (const r of recs) {
          st.decisions++;
          if (r.grade === 'acierto') st.good++;
          else if (r.grade === 'imprecision') st.inaccuracies++;
          else st.errors++;
          st.evLoss += r.evLoss;
          for (const t of r.tags) st.tags[t] = (st.tags[t] ?? 0) + 1;
        }
        d.history.blackjack.unshift({
          id: uid(),
          ts: Date.now(),
          dealer: s.dealer.slice(),
          hands: h.hands.map((x) => ({ cards: x.cards.slice(), bet: x.bet, outcome: x.outcome ?? 'lose', net: x.net })),
          insuranceNet: h.insuranceNet,
          net,
          review: recs.map((r) => ({ grade: r.grade, comment: r.comment })),
        });
      });
      if (net > 0) {
        play('win');
        vibrate(30, profile.settings.haptics);
      } else if (net < 0) play('lose');
      const d = handTotal(s.dealer);
      announce(
        `Crupier: ${d.total > 21 ? 'se pasa' : d.total}. ${net > 0 ? `Ganas ${fmtChips(net)}` : net < 0 ? `Pierdes ${fmtChips(-net)}` : 'Empate'}.`,
      );
    },
    [humanIdx, update, announce, profile.settings.haptics],
  );

  // Turnos automáticos de compañeros y seguro de la IA.
  useEffect(() => {
    const s = state;
    if (s.phase === 'insurance') {
      const pendingAI = s.seats.findIndex((x) => !x.isHuman && !x.insuranceDecided);
      const humanSeat = s.seats[humanIdx]!;
      if (!humanSeat.insuranceDecided) {
        setInsAdvice(bjInsuranceAdvice(blackjackView(s)));
      }
      if (pendingAI >= 0) {
        const t = window.setTimeout(() => {
          const n = structuredClone(stateRef.current);
          if (n.phase !== 'insurance' || n.seats[pendingAI]!.insuranceDecided) return;
          const lv = (layout[pendingAI] as Companion).level;
          decideInsurance(n, pendingAI, decideInsuranceAI(lv, blackjackView(n), pendingAI));
          commit(n);
        }, speed * 0.6);
        return () => window.clearTimeout(t);
      }
      return;
    }
    setInsAdvice(null);
    if (s.phase === 'playing' && s.turn) {
      const seat = s.seats[s.turn.seat]!;
      if (seat.isHuman) {
        setAdvice(bjAdvice(blackjackView(s)));
        play('turn');
        return;
      }
      setAdvice(null);
      const t = window.setTimeout(() => {
        const n = structuredClone(stateRef.current);
        if (n.phase !== 'playing' || !n.turn || n.turn.seat !== s.turn!.seat) return;
        const lv = (layout[n.turn.seat] as Companion).level;
        const a = decideBJ(lv, blackjackView(n));
        applyBJAction(n, a);
        play(a === 'stand' ? 'click' : 'card');
        commit(n);
      }, speed);
      return () => window.clearTimeout(t);
    }
    setAdvice(null);
    if (s.phase === 'settled') processSettlement(s);
  }, [state, humanIdx, layout, speed, commit, processSettlement]);

  // Si se sale a mitad de ronda, la ronda se resuelve sola con estrategia básica (sin anularla).
  const settleRef = useRef(processSettlement);
  settleRef.current = processSettlement;
  useEffect(
    () => () => {
      const cur = stateRef.current;
      if (cur.phase !== 'insurance' && cur.phase !== 'playing') return;
      const n = structuredClone(cur);
      let guard = 0;
      while (n.phase === 'insurance' && guard++ < 10) {
        const i = n.seats.findIndex((x) => !x.insuranceDecided);
        if (i < 0) break;
        decideInsurance(n, i, 0);
      }
      while (n.phase === 'playing' && guard++ < 200) {
        const seatIdx = n.turn!.seat;
        const lv: BJLevel = n.seats[seatIdx]!.isHuman ? 'advanced' : (layoutRef.current[seatIdx] as Companion).level;
        applyBJAction(n, decideBJ(lv, blackjackView(n)));
      }
      if (n.phase === 'settled') settleRef.current(n);
    },
    [],
  );

  const act = useCallback(
    (a: BJAction) => {
      const cur = stateRef.current;
      if (cur.phase !== 'playing' || !cur.turn || !cur.seats[cur.turn.seat]!.isHuman) return;
      if (!getLegal(cur)[a]) return;
      const adv = bjAdvice(blackjackView(cur));
      if (adv && profile.settings.coach) decisions.current.push(gradeBJ(cur, adv, a));
      const n = structuredClone(cur);
      applyBJAction(n, a);
      play(a === 'stand' ? 'click' : a === 'double' || a === 'split' ? 'chip' : 'card');
      vibrate(10, profile.settings.haptics);
      commit(n);
    },
    [commit, profile.settings.coach, profile.settings.haptics],
  );

  const insurance = useCallback(
    (take: boolean) => {
      const cur = stateRef.current;
      if (cur.phase !== 'insurance' || cur.seats[humanIdx]!.insuranceDecided) return;
      const adv = bjInsuranceAdvice(blackjackView(cur));
      if (profile.settings.coach) decisions.current.push(gradeInsurance(adv, take));
      const n = structuredClone(cur);
      decideInsurance(n, humanIdx, take ? maxInsurance(n, humanIdx) : 0);
      if (take) play('chip');
      commit(n);
    },
    [commit, humanIdx, profile.settings.coach],
  );

  const newShoe = useCallback(() => {
    const cur = stateRef.current;
    if (cur.phase !== 'betting' && cur.phase !== 'settled') return;
    const n = structuredClone(cur);
    reshuffle(n, rng);
    play('shuffle');
    commit(n);
  }, [commit]);

  return {
    state,
    layout,
    humanIdx,
    bet,
    setBet,
    deal,
    act,
    insurance,
    advice,
    insAdvice,
    lastReview,
    applySetup,
    newShoe,
    remaining: cardsRemaining(state),
  };
}
