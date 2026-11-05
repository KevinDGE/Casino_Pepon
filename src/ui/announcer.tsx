import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface Toast { id: number; text: string; tone: 'info' | 'good' | 'bad' }
interface AnnApi { announce: (text: string) => void; toast: (text: string, tone?: Toast['tone']) => void }
const Ctx = createContext<AnnApi | null>(null);

/** Región aria-live para lectores de pantalla + avisos visuales breves. */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const announce = useCallback((text: string) => {
    setMsg('');
    window.setTimeout(() => setMsg(text), 30);
  }, []);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <Ctx.Provider value={{ announce, toast }}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{msg}</div>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useAnnouncer(): AnnApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAnnouncer fuera del proveedor');
  return v;
}
