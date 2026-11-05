import { useEffect, useState } from 'react';

/** ¿El área disponible es apaisada (más ancha que alta)? */
export function useLandscape(): boolean {
  const get = () => (typeof window === 'undefined' ? false : window.innerWidth > window.innerHeight * 1.05 && window.innerWidth >= 560);
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return v;
}

/** Atajos de teclado (ignora cuando se escribe en un campo de texto o hay un diálogo abierto). */
export function useHotkeys(map: Record<string, () => void>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (document.querySelector('.modal-backdrop')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = map[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
}
