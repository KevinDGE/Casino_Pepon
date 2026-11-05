import { parseCard, parseCards, fullDeck } from '../../src/core/cards';

/**
 * Construye un mazo amañado para pruebas.
 * `holes[i]` son las cartas del i-ésimo jugador EN ORDEN DE REPARTO
 * (empezando a la izquierda del botón). `board` = 5 cartas.
 */
export function riggedDeck(holes: string[], board: string): number[] {
  const hs = holes.map((h) => parseCards(h));
  const b = parseCards(board);
  const used = new Set<number>([...hs.flat(), ...b]);
  const rest = fullDeck().filter((c) => !used.has(c));
  const deck: number[] = [];
  for (const h of hs) deck.push(h[0]!);
  for (const h of hs) deck.push(h[1]!);
  const filler = () => rest.shift()!;
  deck.push(filler(), b[0]!, b[1]!, b[2]!, filler(), b[3]!, filler(), b[4]!);
  while (rest.length) deck.push(rest.shift()!);
  return deck;
}

export const c = parseCard;
export const cs = parseCards;
