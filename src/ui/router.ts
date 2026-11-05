import { useEffect, useState } from 'react';

export type Route =
  | 'lobby' | 'poker' | 'blackjack' | 'roulette' | 'stats' | 'history' | 'how' | 'settings'
  | 'videopoker' | 'baccarat' | 'trescartas' | 'dados' | 'tragamonedas' | 'keno' | 'mayormenor' | 'ranking';
const ROUTES: Route[] = [
  'lobby', 'poker', 'blackjack', 'roulette', 'stats', 'history', 'how', 'settings',
  'videopoker', 'baccarat', 'trescartas', 'dados', 'tragamonedas', 'keno', 'mayormenor', 'ranking',
];

function parse(): { route: Route; sub: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [r = '', sub = ''] = h.split('/');
  return { route: (ROUTES as string[]).includes(r) ? (r as Route) : 'lobby', sub };
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
  const target = `#/${route === 'lobby' ? '' : route}${sub ? '/' + sub : ''}`;
  if (window.location.hash !== target) window.location.hash = target;
  window.scrollTo({ top: 0 });
}
