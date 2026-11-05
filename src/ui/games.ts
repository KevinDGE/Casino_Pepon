/** Catálogo de juegos del lobby. */
import type { Route } from './router';

export type GameCategory = 'cartas' | 'mesa' | 'dados' | 'maquinas' | 'sorteos';

export interface GameInfo {
  route: Route;
  name: string;
  tag: string;
  desc: string;
  category: GameCategory;
  /** Texto de transparencia (RTP o ventaja de la casa). */
  edge: string;
  isNew?: boolean;
  /** ¿Tiene rivales de IA o coach de decisiones? */
  smart?: string;
}

export const CATEGORY_NAMES: Record<GameCategory | 'todos', string> = {
  todos: 'Todos', cartas: 'Cartas', mesa: 'Mesa', dados: 'Dados', maquinas: 'Máquinas', sorteos: 'Sorteos',
};

export const GAMES: GameInfo[] = [
  { route: 'poker', name: 'Texas Hold’em', tag: 'No-Limit · 1 a 5 rivales de IA', desc: 'Rivales que calculan equity, rangos y pot odds. El coach te explica cada decisión.', category: 'cartas', edge: 'Juego entre jugadores', smart: 'IA experta + coach' },
  { route: 'blackjack', name: 'Blackjack', tag: 'Reglas configurables', desc: 'Pedir, plantarse, doblar, dividir y seguro con EV exacto de cada acción.', category: 'mesa', edge: 'Casa ≈ 0.4 % jugando perfecto', smart: 'Coach con EV' },
  { route: 'roulette', name: 'Ruleta europea', tag: 'Un solo cero', desc: 'Todas las apuestas, historial y probabilidades sin estrategias mágicas.', category: 'mesa', edge: 'Casa 2.70 %' },
  { route: 'videopoker', name: 'Video póker', tag: 'Jotas o mejor · 9/6', desc: 'Conserva las cartas correctas: el coach calcula el EV exacto de las 32 opciones.', category: 'maquinas', edge: 'RTP 99.54 % jugando perfecto', isNew: true, smart: 'Coach exacto' },
  { route: 'baccarat', name: 'Baccarat', tag: 'Punto y Banca', desc: 'Elige Punto, Banca o Empate. Reglas de tercera carta automáticas y camino de resultados.', category: 'cartas', edge: 'Banca 1.06 % · Punto 1.24 %', isNew: true },
  { route: 'trescartas', name: 'Póker de 3 cartas', tag: 'Ante, Jugar y Pair Plus', desc: 'Contra el crupier: decide jugar o retirarte con el EV exacto del coach.', category: 'cartas', edge: 'Casa 3.37 % (Ante)', isNew: true, smart: 'Coach exacto' },
  { route: 'dados', name: 'Tres Dados', tag: 'Chico, Grande, sumas y triples', desc: 'Tres dados y decenas de apuestas, cada una con su probabilidad exacta.', category: 'dados', edge: 'Casa desde 2.78 %', isNew: true },
  { route: 'tragamonedas', name: 'Fiesta Pepona', tag: 'Tragamonedas · 5 líneas', desc: 'Carretes honestos con RTP exacto publicado. Sin “casi ganas” ni giros automáticos.', category: 'maquinas', edge: 'RTP 96.57 %', isNew: true },
  { route: 'keno', name: 'Keno', tag: 'Elige de 1 a 10 números', desc: 'Se sortean 20 de 80. Tabla de pagos con probabilidades hipergeométricas exactas.', category: 'sorteos', edge: 'RTP 92–95 %', isNew: true },
  { route: 'mayormenor', name: 'Mayor o Menor', tag: 'Adivina la siguiente carta', desc: 'Pagos calculados con las cartas que quedan en el mazo.', category: 'cartas', edge: 'Casa 3 %', isNew: true },
];

export const gameName = (route: string): string => GAMES.find((g) => g.route === route)?.name ?? route;
