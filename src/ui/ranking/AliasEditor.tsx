import { useEffect, useState } from 'react';
import { Field } from '../components/Controls';
import type { RankingBackend } from '../../ranking/online';

/**
 * Apodo público (sólo en la versión de GitHub Pages, donde no hay cuentas).
 * Se muestra en el ranking y en las mesas en línea a las demás personas.
 */
export function AliasEditor({ be }: { be: RankingBackend }) {
  const api = be.alias;
  const [saved, setSaved] = useState(() => api?.get() ?? '');
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const a = api?.get() ?? ''; setSaved(a); setValue(a); }, [api]);
  if (!api) return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  const changed = clean !== saved;
  const save = async () => {
    setBusy(true);
    try {
      await api.set(clean);
      const a = api.get();
      setSaved(a);
      setValue(a);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel alias-panel" aria-label="Tu apodo">
      <Field label="Tu apodo" hint={be.myId ? 'Así te ven las demás personas en el ranking y en las mesas. Máximo 20 caracteres; no uses tu nombre completo ni datos personales.' : 'No se pudo iniciar tu sesión anónima: por ahora sólo puedes ver.'}>
        <form className="alias-row" onSubmit={(e) => { e.preventDefault(); if (changed && !busy) void save(); }}>
          <input
            id="alias-input"
            className="text-input"
            value={value}
            maxLength={20}
            placeholder="p. ej. El Pepón"
            autoComplete="nickname"
            disabled={!be.myId}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn btn-gold" disabled={!be.myId || !changed || busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </form>
      </Field>
      {be.myId && !saved ? <p className="muted small">Sin apodo apareces como “Jugador”.</p> : null}
    </section>
  );
}
