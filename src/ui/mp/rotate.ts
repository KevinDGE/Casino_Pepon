/**
 * Gira una mesa para que el jugador local quede en el asiento 0 (abajo al
 * centro en la vista) y pone nombres y sus cartas descifradas sólo para mostrar.
 */
import type { HandEvent, PokerState } from '../../engine/poker/types';

export function rotateForView(src: PokerState, mySeat: number, names: Record<string, string>, myHole: number[] | null): PokerState {
  const s = structuredClone(src);
  const n = s.players.length;
  const k = mySeat >= 0 ? mySeat : 0;
  const map = (seat: number) => (seat < 0 ? seat : (seat - k + n) % n);
  const players = s.players.map((p) => ({ ...p })).sort((a, b) => map(a.seat) - map(b.seat));
  players.forEach((p) => {
    const isMe = mySeat >= 0 && p.seat === mySeat;
    p.name = names[p.id] || 'Jugador';
    p.isHuman = isMe;
    if (isMe) p.hole = myHole && myHole.every((c) => c >= 0) ? myHole.slice() : [];
    else if (p.hole.some((c) => c < 0)) p.hole = p.hole.map(() => 0); // ocultas: la vista las muestra boca abajo
    p.seat = map(p.seat);
  });
  s.players = players;
  s.button = map(s.button);
  s.sbSeat = map(s.sbSeat);
  s.bbSeat = map(s.bbSeat);
  s.toAct = s.toAct === null ? null : map(s.toAct);
  s.lastAggressor = s.lastAggressor === null ? null : map(s.lastAggressor);
  s.revealed = s.revealed.map(map);
  s.log = s.log.map((e) => ('seat' in e ? ({ ...e, seat: map(e.seat) } as HandEvent) : e));
  if (s.result) {
    const net: Record<number, number> = {};
    for (const [seat, v] of Object.entries(s.result.net)) net[map(Number(seat))] = v;
    s.result = {
      ...s.result,
      net,
      scores: Object.fromEntries(Object.entries(s.result.scores).map(([seat, v]) => [map(Number(seat)), v])),
      pots: s.result.pots.map((p) => ({ ...p, eligible: p.eligible.map(map), winners: p.winners.map(map) })),
    };
  }
  return s;
}
