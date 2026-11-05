/**
 * Modelo de rivales construido SÓLO con información pública
 * (acciones y cartas mostradas en showdown). Se actualiza al final de cada mano.
 */
import type { HandEvent } from '../../engine/poker/types';
import { boardStrength } from './ranges';
import { comboOf } from './combos';

export interface PlayerStats {
  hands: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  threeBetOpp: number;
  postBets: number;
  postCalls: number;
  postChecks: number;
  facedBet: number;
  foldToBet: number;
  showdowns: number;
  aggressiveShowdowns: number;
  bluffsShown: number;
  /** Preflop: veces que enfrentó una subida sin haber subido antes / veces que se retiró. */
  preFacedRaise: number;
  preFoldToRaise: number;
  /** Enfrentó una re-subida después de haber sido agresor en la misma calle (pre/post) / se retiró / volvió a subir. */
  preFacedReraise: number;
  preFoldToReraise: number;
  preReraise: number;
  postFacedReraise: number;
  postFoldToReraise: number;
  postReraise: number;
  /** Postflop: subió al enfrentar una apuesta. */
  postRaiseVsBet: number;
}

export type ModelStore = Record<string, PlayerStats>;

export const emptyStats = (): PlayerStats => ({
  hands: 0, vpip: 0, pfr: 0, threeBet: 0, threeBetOpp: 0, postBets: 0, postCalls: 0, postChecks: 0,
  facedBet: 0, foldToBet: 0, showdowns: 0, aggressiveShowdowns: 0, bluffsShown: 0,
  preFacedRaise: 0, preFoldToRaise: 0, preFacedReraise: 0, preFoldToReraise: 0, preReraise: 0,
  postFacedReraise: 0, postFoldToReraise: 0, postReraise: 0, postRaiseVsBet: 0,
});

/** Tendencias suavizadas (con priors), listas para usar. */
export interface Tendencies {
  vpip: number;
  pfr: number;
  threeBet: number;
  aggFreq: number;
  foldToBet: number;
  bluffRate: number;
  /** Preflop: probabilidad de retirarse ante una subida (sin haber subido antes). */
  foldToRaisePre: number;
  /** Probabilidad de retirarse ante una re-subida tras haber sido agresor. */
  foldToReraisePre: number;
  foldToReraisePost: number;
  /** Probabilidad de volver a subir ante una re-subida. */
  reraisePre: number;
  reraisePost: number;
  /** Postflop: probabilidad de subir al enfrentar una apuesta. */
  raiseVsBet: number;
  hands: number;
}

const smooth = (count: number, n: number, prior: number, w: number) => (count + prior * w) / (n + w);

export function tendencies(s: PlayerStats | undefined): Tendencies {
  const st = s ?? emptyStats();
  const postN = st.postBets + st.postCalls + st.postChecks;
  return {
    vpip: smooth(st.vpip, st.hands, 0.3, 12),
    pfr: smooth(st.pfr, st.hands, 0.17, 12),
    threeBet: smooth(st.threeBet, st.threeBetOpp, 0.07, 10),
    aggFreq: smooth(st.postBets, postN, 0.33, 10),
    foldToBet: smooth(st.foldToBet, st.facedBet, 0.45, 10),
    bluffRate: smooth(st.bluffsShown, st.aggressiveShowdowns, 0.3, 4),
    foldToRaisePre: smooth(st.preFoldToRaise ?? 0, st.preFacedRaise ?? 0, 0.6, 10),
    foldToReraisePre: smooth(st.preFoldToReraise ?? 0, st.preFacedReraise ?? 0, 0.45, 6),
    foldToReraisePost: smooth(st.postFoldToReraise ?? 0, st.postFacedReraise ?? 0, 0.35, 6),
    reraisePre: smooth(st.preReraise ?? 0, st.preFacedReraise ?? 0, 0.2, 6),
    reraisePost: smooth(st.postReraise ?? 0, st.postFacedReraise ?? 0, 0.2, 6),
    raiseVsBet: smooth(st.postRaiseVsBet ?? 0, st.facedBet, 0.1, 10),
    hands: st.hands,
  };
}

/** Actualiza estadísticas con el registro de una mano terminada (información pública). */
export function observeHand(store: ModelStore, log: readonly HandEvent[], ids: readonly string[]): void {
  const start = log.find((e) => e.t === 'start');
  if (!start) return;
  const dealt = new Set<number>();
  for (const e of log) if (e.t === 'post' || e.t === 'action') dealt.add(e.seat);
  // Todos los jugadores vivos recibieron cartas; usamos los que aparecen en acciones o ciegas,
  // más quienes hablan en preflop.
  const seatsSeen = new Set<number>(dealt);
  const vpip = new Set<number>();
  const pfr = new Set<number>();
  const threeBet = new Set<number>();
  const threeBetOpp = new Set<number>();
  let raisesPre = 0;
  let betThisStreet = false;
  let street = 'preflop';
  let maxTo = start.bigBlind;
  const aggressorsThisStreet = new Set<number>();
  const lastAggOnRiver = new Set<number>();
  const board: number[] = [];
  for (const e of log) {
    if (e.t === 'street') {
      street = e.street;
      betThisStreet = false;
      maxTo = 0;
      aggressorsThisStreet.clear();
      board.length = 0;
      board.push(...e.board);
      continue;
    }
    if (e.t !== 'action') continue;
    const s = (store[ids[e.seat]!] ??= emptyStats());
    const aggressive = e.kind === 'bet' || e.kind === 'raise' || (e.kind === 'allin' && e.to > maxTo);
    const facing = street === 'preflop' ? raisesPre > 0 : betThisStreet;
    const response = e.kind === 'fold' || e.kind === 'call' || e.kind === 'raise' || e.kind === 'allin';
    if (facing && response) {
      if (aggressorsThisStreet.has(e.seat)) {
        if (street === 'preflop') {
          s.preFacedReraise++;
          if (e.kind === 'fold') s.preFoldToReraise++;
          if (aggressive) s.preReraise++;
        } else {
          s.postFacedReraise++;
          if (e.kind === 'fold') s.postFoldToReraise++;
          if (aggressive) s.postReraise++;
        }
      } else if (street === 'preflop') {
        s.preFacedRaise++;
        if (e.kind === 'fold') s.preFoldToRaise++;
      }
    }
    if (street === 'preflop') {
      if (raisesPre === 1) threeBetOpp.add(e.seat);
      if (e.kind === 'call' || e.kind === 'raise' || e.kind === 'bet' || (e.kind === 'allin' && e.amount > 0)) vpip.add(e.seat);
      if (aggressive) {
        pfr.add(e.seat);
        if (raisesPre === 1) threeBet.add(e.seat);
        raisesPre++;
      }
    } else {
      if (facing && response && !aggressorsThisStreet.has(e.seat)) {
        s.facedBet++;
        if (e.kind === 'fold') s.foldToBet++;
        if (aggressive) s.postRaiseVsBet++;
      }
      if (aggressive) {
        s.postBets++;
        betThisStreet = true;
        if (street === 'river') lastAggOnRiver.add(e.seat);
      } else if (e.kind === 'call' || e.kind === 'allin') s.postCalls++;
      else if (e.kind === 'check') s.postChecks++;
    }
    if (aggressive) {
      aggressorsThisStreet.add(e.seat);
      maxTo = Math.max(maxTo, e.to);
    }
  }
  for (const seat of seatsSeen) {
    const id = ids[seat];
    if (!id) continue;
    const s = (store[id] ??= emptyStats());
    s.hands++;
    if (vpip.has(seat)) s.vpip++;
    if (pfr.has(seat)) s.pfr++;
    if (threeBetOpp.has(seat)) s.threeBetOpp++;
    if (threeBet.has(seat)) s.threeBet++;
  }
  // Showdown: ¿quién apostó en el river y qué mostró?
  const lastBoard = [...board];
  for (const e of log) {
    if (e.t !== 'show') continue;
    const id = ids[e.seat];
    if (!id) continue;
    const s = (store[id] ??= emptyStats());
    s.showdowns++;
    if (lastAggOnRiver.has(e.seat) && lastBoard.length === 5) {
      s.aggressiveShowdowns++;
      const bs = boardStrength(lastBoard);
      const made = bs.made[comboOf(e.hole[0]!, e.hole[1]!)]!;
      if (made < 0.55) s.bluffsShown++;
    }
  }
}
