/**
 * Baccarat (Punto y Banca), 8 mazos, reglas estándar de tercera carta.
 * Banca paga 0.95:1 (comisión de 5 %), Punto 1:1, Empate 8:1, Parejas 11:1.
 */
import type { Card } from '../../core/cards';
import { type Rng, shuffleInPlace } from '../../core/rng';

export type BacBet = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair';
export const BAC_NAMES_ES: Record<BacBet, string> = {
  player: 'Punto', banker: 'Banca', tie: 'Empate', playerPair: 'Pareja de Punto', bankerPair: 'Pareja de Banca',
};
export const BAC_PAYS: Record<BacBet, number> = { player: 1, banker: 0.95, tie: 8, playerPair: 11, bankerPair: 11 };
/** Ventaja de la casa con 8 mazos (análisis combinatorio publicado). */
export const BAC_HOUSE_EDGE: Record<BacBet, number> = { player: 0.0124, banker: 0.0106, tie: 0.1436, playerPair: 0.1036, bankerPair: 0.1036 };

export const bacValue = (c: Card): number => {
  const r = c >> 2;
  if (r === 12) return 1;
  if (r >= 8) return 0;
  return r + 2;
};
export const bacTotal = (cards: readonly Card[]): number => cards.reduce((a, c) => a + bacValue(c), 0) % 10;

export interface BacShoe {
  cards: Card[];
  pos: number;
}

export function newBacShoe(rng: Rng, decks = 8): BacShoe {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) cards.push(c);
  return { cards: shuffleInPlace(cards, rng), pos: 0 };
}

export interface BacRound {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: 'player' | 'banker' | 'tie';
  natural: boolean;
  playerPair: boolean;
  bankerPair: boolean;
}

/** ¿La banca pide tercera carta? `p3` = valor de la tercera carta de Punto (null si no pidió). */
export function bankerDraws(bankerTotal: number, p3: number | null): boolean {
  if (p3 === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0: case 1: case 2: return true;
    case 3: return p3 !== 8;
    case 4: return p3 >= 2 && p3 <= 7;
    case 5: return p3 >= 4 && p3 <= 7;
    case 6: return p3 === 6 || p3 === 7;
    default: return false;
  }
}

/** Juega una ronda. Baraja un zapato nuevo si quedan menos de 6 cartas. */
export function playBaccarat(shoe: BacShoe, rng: Rng): BacRound {
  if (shoe.cards.length - shoe.pos < 6) {
    const fresh = newBacShoe(rng, shoe.cards.length / 52);
    shoe.cards = fresh.cards;
    shoe.pos = 0;
  }
  const draw = () => shoe.cards[shoe.pos++]!;
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  let pt = bacTotal(player);
  let bt = bacTotal(banker);
  const natural = pt >= 8 || bt >= 8;
  if (!natural) {
    let p3: number | null = null;
    if (pt <= 5) {
      const c = draw();
      player.push(c);
      p3 = bacValue(c);
      pt = bacTotal(player);
    }
    if (bankerDraws(bt, p3)) {
      banker.push(draw());
      bt = bacTotal(banker);
    }
  }
  return {
    player, banker, playerTotal: pt, bankerTotal: bt,
    winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie',
    natural,
    playerPair: player[0]! >> 2 === player[1]! >> 2,
    bankerPair: banker[0]! >> 2 === banker[1]! >> 2,
  };
}

/** Fichas devueltas (apuesta + ganancia) por una apuesta. */
export function bacReturn(bet: BacBet, amount: number, r: BacRound): number {
  switch (bet) {
    case 'player': return r.winner === 'player' ? amount * 2 : r.winner === 'tie' ? amount : 0;
    case 'banker': return r.winner === 'banker' ? amount * 1.95 : r.winner === 'tie' ? amount : 0;
    case 'tie': return r.winner === 'tie' ? amount * 9 : 0;
    case 'playerPair': return r.playerPair ? amount * 12 : 0;
    case 'bankerPair': return r.bankerPair ? amount * 12 : 0;
  }
}
