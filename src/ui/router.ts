import { useEffect, useState } from 'react';

export type Route =
  | 'lobby' | 'poker' | 'blackjack' | 'roulette' | 'stats' | 'history' | 'how' | 'settings'
  | 'videopoker' | 'baccarat' | 'trescartas' | 'dados' | 'tragamonedas' | 'keno' | 'mayormenor' | 'ranking';
const ROUTES: Route[] = [
  'lobby', 'poker', 'blackjack', 'roulette', 'stats', 'history', 'how', 'settings',
  'videopoker', 'baccarat', 'trescartas', 'dados', 'tragamonedas', 'keno', 'mayormenor', 'ranking',
];

/**
 * Nombre en el hash de cada ruta. Se usan hashes simples (`#poker`) porque es
 * lo único que conservan los enlaces de claude.ai, y se evitan nombres que la
 * plataforma reserva (p. ej. `settings`). También se aceptan los formatos
 * anteriores (`#/poker`, `#/settings`).
 */
const HASH: Record<Route, string> = {
  lobby: 'inicio', poker: 'poker', blackjack: 'blackjack', roulette: 'ruleta', stats: 'estadisticas', history: 'historial',
  how: 'reglas', settings: 'ajustes', videopoker: 'videopoker', baccarat: 'baccarat', trescartas: 'trescartas', dados: 'dados',
  tragamonedas: 'tragamonedas', keno: 'keno', mayormenor: 'mayormenor', ranking: 'ranking',
};
const FROM_HASH = new Map<string, Route>(Object.entries(HASH).map(([r, h]) => [h, r as Route]));

export const hrefFor = (route: Route): string => `#${HASH[route]}`;

function parse(): { route: Route; sub: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [r = '', sub = ''] = h.split('/');
  const route = FROM_HASH.get(r) ?? ((ROUTES as string[]).includes(r) ? (r as Route) : 'lobby');
  return { route, sub };
}

export function useRoute(): { route: Route; sub: string } {
  const [state, setState] = useState(parse);
  useEffect(() => {
    const on = () => setState(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return state;
}

export function navigate(route: Route, sub = ''): void {
  const target = `${hrefFor(route)}${sub ? '-' + sub : ''}`;
  if (window.location.hash !== target) window.location.hash = target;
  window.scrollTo({ top: 0 });
}
