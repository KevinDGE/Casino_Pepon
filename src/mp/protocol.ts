/**
 * Protocolo de mesa multijugador (sin servidor).
 *
 * Cada jugador publica sólo su propio documento. La mano se reconstruye de
 * forma determinista en cada navegador a partir de:
 *  - la alineación de la mano (la publica quien hospeda: jugadores, fichas, botón),
 *  - los mensajes de cada jugador para esa mano (barajado, pase de cartas
 *    propias, revelado de calles, clave en el showdown y acciones de apuesta).
 *
 * Póker mental: el mazo se cifra y baraja en cadena (cada jugador añade su capa
 * SRA y permuta). Para repartir, cada jugador quita su capa de las cartas de
 * los DEMÁS; la última capa de tus cartas sólo la quitas tú. Las cartas
 * comunitarias se revelan con un pase en el que todos quitan su capa. En el
 * showdown, quienes siguen en la mano publican su clave de descifrado.
 */
import { createGame, getLegalActions, applyAction, continueHand, holePositions, startHand } from '../engine/poker/game';
import type { PokerAction, PokerState, Street } from '../engine/poker/types';
import { SeededRng, type Rng } from '../core/rng';
import { baseDeckHex, decodeCard, decrypt, fromHex, shuffleStep, stripStep, toHex, type SraKey } from './sra';

export interface HostInfo {
  tableId: string;
  name: string;
  sb: number;
  bb: number;
  buyIn: number;
  maxSeats: number;
  createdAt: number;
}

export interface Lineup {
  n: number;
  /** Ids en orden de asiento. */
  players: string[];
  stacks: number[];
  /** Índice (en `players`) del botón. */
  button: number;
  sb: number;
  bb: number;
}

export interface Act {
  /** Número de acción dentro de la mano (0, 1, 2…). */
  s: number;
  t: 'f' | 'k' | 'c' | 'r';
  to?: number;
}

export interface HandMsgs {
  n: number;
  shuf?: string[];
  hole?: string[];
  rv?: Partial<Record<Street, string[]>>;
  /** Clave de descifrado publicada en el showdown (hex). */
  d?: string;
  acts: Act[];
}

export interface PlayerDoc {
  v: 1;
  table: string | null;
  seat: number;
  joinedAt: number;
  alive: number;
  /** Listo para la mano número `ready`. */
  ready: number;
  hostOpen?: boolean;
  host?: HostInfo | null;
  lineup?: Lineup | null;
  kicks?: { n: number; s: number }[];
  voided?: number[];
  h?: HandMsgs | null;
}

export type Pending =
  | { kind: 'waitLineup' }
  | { kind: 'void' }
  | { kind: 'shuffle'; who: string; input: string[] }
  | { kind: 'hole'; who: string; input: string[]; strip: boolean[] }
  | { kind: 'act'; who: string; seq: number }
  | { kind: 'reveal'; who: string; street: Street; input: string[] }
  | { kind: 'showdown'; who: string[] }
  | { kind: 'done' }
  | { kind: 'error'; who: string | null; message: string };

export interface Replay {
  lineup: Lineup | null;
  state: PokerState | null;
  pending: Pending;
  /** Mis cartas descifradas (si estoy en la mano y tengo mi clave). */
  myHole: number[] | null;
  mySeat: number;
}

const msgs = (docs: Record<string, PlayerDoc>, uid: string, n: number): HandMsgs | null => {
  const h = docs[uid]?.h;
  return h && h.n === n ? h : null;
};

const validVec = (v: unknown, len: number): v is string[] => Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'string' && /^[0-9a-f]{1,300}$/i.test(x));

function toAction(a: Act): PokerAction {
  if (a.t === 'f') return { type: 'fold' };
  if (a.t === 'k') return { type: 'check' };
  if (a.t === 'c') return { type: 'call' };
  return { type: 'raise', to: Math.floor(Number(a.to) || 0) };
}

export function fromAction(a: PokerAction, seq: number): Act {
  if (a.type === 'raise') return { s: seq, t: 'r', to: a.to };
  return { s: seq, t: a.type === 'fold' ? 'f' : a.type === 'check' ? 'k' : 'c' };
}

/** Reconstruye la mano actual. Pura y determinista. */
export function replayHand(lineup: Lineup | null, docs: Record<string, PlayerDoc>, host: PlayerDoc | null, me: string, myKey: Pick<SraKey, 'd'> | null): Replay {
  if (!lineup) return { lineup, state: null, pending: { kind: 'waitLineup' }, myHole: null, mySeat: -1 };
  const n = lineup.n;
  const N = lineup.players.length;
  const mySeat = lineup.players.indexOf(me);
  const g = createGame(
    { smallBlind: lineup.sb, bigBlind: lineup.bb, blindIncreaseEvery: 0 },
    lineup.players.map((id, i) => ({ id, name: id, isHuman: id === me, stack: lineup.stacks[i]! })),
    lineup.button,
  );
  g.handNumber = n - 1;
  startHand(g, new SeededRng(1), new Array<number>(52).fill(-1));
  const out = (pending: Pending, myHole: number[] | null = null): Replay => ({ lineup, state: g, pending, myHole, mySeat });
  if (host?.voided?.includes(n)) return out({ kind: 'void' });

  // 1) Barajado en cadena.
  let deck = baseDeckHex();
  for (let k = 0; k < N; k++) {
    const m = msgs(docs, lineup.players[k]!, n);
    if (!m?.shuf) return out({ kind: 'shuffle', who: lineup.players[k]!, input: deck });
    if (!validVec(m.shuf, 52)) return out({ kind: 'error', who: lineup.players[k]!, message: 'barajado inválido' });
    deck = m.shuf;
  }
  const finalDeck = deck;

  // 2) Pase de cartas propias: cada quien quita su capa de las cartas ajenas.
  const holePos = holePositions(g);
  const ownerOf = new Array<number>(2 * N).fill(-1);
  for (const [seat, [a, b]] of Object.entries(holePos)) { ownerOf[a] = Number(seat); ownerOf[b] = Number(seat); }
  let holes = finalDeck.slice(0, 2 * N);
  for (let k = 0; k < N; k++) {
    const m = msgs(docs, lineup.players[k]!, n);
    if (!m?.hole) return out({ kind: 'hole', who: lineup.players[k]!, input: holes, strip: ownerOf.map((o) => o !== k) });
    if (!validVec(m.hole, 2 * N)) return out({ kind: 'error', who: lineup.players[k]!, message: 'reparto inválido' });
    holes = m.hole;
  }
  let myHole: number[] | null = null;
  if (mySeat >= 0 && myKey) {
    const [a, b] = holePos[mySeat]!;
    myHole = [a, b].map((p) => decodeCard(decrypt(fromHex(holes[p]!), myKey)));
    if (myHole.some((c) => c < 0)) return out({ kind: 'error', who: null, message: 'tus cartas no se pudieron descifrar' }, null);
  }

  // 3) Apuestas y revelado de calles, en orden.
  const kicks = new Set((host?.kicks ?? []).filter((k) => k.n === n).map((k) => k.s));
  let seq = 0;
  const known = new Set<number>(myHole ?? []);
  for (let guard = 0; guard < 500; guard++) {
    if (g.phase === 'betting' && g.toAct !== null) {
      const actor = lineup.players[g.toAct]!;
      const a = msgs(docs, actor, n)?.acts?.find((x) => x.s === seq);
      if (!a && !kicks.has(seq)) return out({ kind: 'act', who: actor, seq }, myHole);
      const l = getLegalActions(g, g.toAct);
      let action: PokerAction = a ? toAction(a) : l.canCheck ? { type: 'check' } : { type: 'fold' };
      try {
        applyAction(g, action);
      } catch {
        // Acción ilegal (o manipulada): cuenta como retirarse / pasar.
        action = l.canCheck ? { type: 'check' } : { type: 'fold' };
        applyAction(g, action);
      }
      seq++;
      continue;
    }
    if (g.phase === 'awaitCards' && g.awaiting?.kind === 'cards') {
      const { street, positions } = g.awaiting;
      let vec = positions.map((p) => finalDeck[p]!);
      for (let k = 0; k < N; k++) {
        const m = msgs(docs, lineup.players[k]!, n);
        const v = m?.rv?.[street];
        if (!v) return out({ kind: 'reveal', who: lineup.players[k]!, street, input: vec }, myHole);
        if (!validVec(v, positions.length)) return out({ kind: 'error', who: lineup.players[k]!, message: 'revelado inválido' }, myHole);
        vec = v;
      }
      const cards = vec.map((h) => decodeCard(fromHex(h)));
      if (cards.some((c) => c < 0 || known.has(c)) || new Set(cards).size !== cards.length) {
        return out({ kind: 'error', who: null, message: 'cartas comunitarias inválidas o repetidas' }, myHole);
      }
      positions.forEach((p, i) => { g.deck[p] = cards[i]!; known.add(cards[i]!); });
      continueHand(g);
      continue;
    }
    if (g.phase === 'awaitShowdown' && g.awaiting?.kind === 'showdown') {
      const seats = g.awaiting.seats;
      const missing = seats.map((s) => lineup.players[s]!).filter((uid) => !msgs(docs, uid, n)?.d);
      if (missing.length) return out({ kind: 'showdown', who: missing }, myHole);
      for (const s of seats) {
        const d = msgs(docs, lineup.players[s]!, n)!.d!;
        let cards: number[];
        try {
          const dk = { d: BigInt('0x' + d) };
          cards = holePos[s]!.map((p) => decodeCard(decrypt(fromHex(holes[p]!), dk)));
        } catch {
          cards = [-1, -1];
        }
        if (cards.some((c) => c < 0) || (s !== mySeat && cards.some((c) => known.has(c)))) {
          return out({ kind: 'error', who: lineup.players[s]!, message: 'cartas del showdown inválidas' }, myHole);
        }
        cards.forEach((c) => known.add(c));
        g.players[s]!.hole = cards;
      }
      continueHand(g);
      continue;
    }
    break;
  }
  return out({ kind: 'done' }, myHole);
}

/**
 * Lo que debo publicar ahora para avanzar el protocolo (pasos criptográficos).
 * Devuelve el parche para mis mensajes de la mano, o null si no me toca.
 */
export function myCryptoStep(r: Replay, me: string, key: SraKey, rng: Rng): Partial<HandMsgs> | null {
  const p = r.pending;
  if (p.kind === 'shuffle' && p.who === me) return { shuf: shuffleStep(p.input, key, rng) };
  if (p.kind === 'hole' && p.who === me) return { hole: stripStep(p.input, key, p.strip) };
  if (p.kind === 'reveal' && p.who === me) return { rv: { [p.street]: stripStep(p.input, key, p.input.map(() => true)) } };
  if (p.kind === 'showdown' && p.who.includes(me)) return { d: toHex(key.d) };
  return null;
}

/** Siguiente alineación (la calcula quien hospeda) tras terminar o anular una mano. */
export function nextLineup(
  prev: Lineup | null,
  prevResultStacks: number[] | null,
  seated: { uid: string; seat: number; ready: number }[],
  host: HostInfo,
  n: number,
): Lineup | null {
  const stackOf = new Map<string, number>();
  if (prev) prev.players.forEach((uid, i) => stackOf.set(uid, (prevResultStacks ?? prev.stacks)[i]!));
  const players = seated
    .filter((p) => p.ready >= n)
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({ uid: p.uid, stack: stackOf.has(p.uid) ? stackOf.get(p.uid)! : host.buyIn }))
    .filter((p) => p.stack > 0);
  if (players.length < 2) return null;
  let button = 0;
  if (prev) {
    const prevBtn = prev.players[prev.button]!;
    const prevSeatOrder = prev.players;
    // El botón pasa al siguiente jugador (en orden de asiento) después del anterior.
    const idx = players.findIndex((p) => p.uid === prevBtn);
    if (idx >= 0) button = (idx + 1) % players.length;
    else {
      const after = prevSeatOrder.slice(prev.button + 1).find((u) => players.some((p) => p.uid === u));
      button = Math.max(0, players.findIndex((p) => p.uid === after));
    }
  }
  return { n, players: players.map((p) => p.uid), stacks: players.map((p) => p.stack), button, sb: host.sb, bb: host.bb };
}
