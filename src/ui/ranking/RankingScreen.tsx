import { useState } from 'react';
import { Page } from '../components/Layout';
import { Segmented } from '../components/Controls';
import { useRanking, useMyTotals, useSyncStatus } from './useRanking';
import { PERIOD_NAMES_ES, periodKeys, periodLabel, type PeriodKind } from '../../ranking/periods';
import { fmtChips, fmtSignedChips } from '../../coach/format';

const STATUS_ES = {
  checking: 'Conectando…',
  local: 'Sin conexión al ranking en línea',
  synced: 'Tu puntaje está publicado',
  pending: 'Publicando tu puntaje…',
  readonly: 'Puedes ver el ranking, pero no aparecer en él',
  error: 'No se pudo publicar tu puntaje; se reintentará con tu próxima ronda',
} as const;

const MEDAL = ['🥇', '🥈', '🥉'];

export function RankingScreen() {
  const [kind, setKind] = useState<PeriodKind>('week');
  const r = useRanking(kind);
  const mine = useMyTotals();
  const sync = useSyncStatus();
  const key = periodKeys()[kind];
  const myNet = kind === 'day' ? mine.dayNet : kind === 'week' ? mine.weekNet : mine.monthNet;
  const myRounds = kind === 'day' ? mine.dayRounds : kind === 'week' ? mine.weekRounds : mine.monthRounds;
  const myPos = r.rows.findIndex((x) => x.isMe);
  return (
    <Page current="ranking" title="Ranking">
      <Segmented label="Periodo" value={kind} onChange={setKind} options={(['day', 'week', 'month'] as PeriodKind[]).map((k) => ({ value: k, label: PERIOD_NAMES_ES[k] }))} />
      <p className="rank-period">{periodLabel(kind, key)} · hora de la Ciudad de México</p>
      <section className="rank-me panel" aria-label="Tu resultado">
        <div>
          <span className="muted small">Tu resultado {PERIOD_NAMES_ES[kind].toLowerCase()}</span>
          <b className={`rank-me-net ${myNet > 0 ? 'good' : myNet < 0 ? 'bad' : ''}`}>{fmtSignedChips(myNet)}</b>
          <span className="muted small">{fmtChips(myRounds)} {myRounds === 1 ? 'ronda' : 'rondas'}{myPos >= 0 ? ` · lugar ${myPos + 1}` : ''}</span>
        </div>
        <span className={`sync-pill sync-${sync}`} role="status">{STATUS_ES[sync]}</span>
      </section>
      {r.mode === 'local' ? (
        <div className="notice">
          El ranking compartido funciona en la versión publicada en claude.ai. Aquí ves tus propios resultados; se guardan en este dispositivo.
        </div>
      ) : null}
      {sync === 'readonly' ? <div className="notice">Tu acceso a este casino es de sólo lectura. Para aparecer en el ranking, pide a quien lo compartió acceso de colaborador.</div> : null}
      {r.mode === 'online' && r.error ? <div className="notice">No se pudo cargar el ranking ({r.error}). Vuelve a abrir la página más tarde.</div> : null}
      {r.stale ? <div className="notice">El ranking aún no responde; lo que ves puede estar desactualizado.</div> : null}
      {r.mode === 'loading' ? <p className="empty" role="status">Cargando ranking…</p> : null}
      {r.mode === 'online' && !r.error ? (
        r.rows.length ? (
          <ol className="rank-list">
            {r.rows.map((row, i) => (
              <li key={row.id} className={`rank-row ${row.isMe ? 'me' : ''} ${i < 3 ? `top top-${i + 1}` : ''}`}>
                <span className="rank-pos" aria-label={`Lugar ${i + 1}`}>{i < 3 ? MEDAL[i] : i + 1}</span>
                {row.avatarUrl ? <img className="rank-avatar" src={row.avatarUrl} alt="" /> : <span className="rank-avatar" style={{ background: row.color }} />}
                <span className="rank-name">{row.isMe ? 'Tú' : row.name || 'Jugador'}<small>{fmtChips(row.rounds)} rondas</small></span>
                <b className={`rank-net ${row.net > 0 ? 'good' : row.net < 0 ? 'bad' : ''}`}>{fmtSignedChips(row.net)}</b>
              </li>
            ))}
          </ol>
        ) : <p className="empty">Nadie ha jugado en este periodo todavía. ¡Sé el primero!</p>
      ) : null}
      <section className="panel">
        <h2 className="panel-title">Cómo funciona el ranking</h2>
        <ul className="plain-list">
          <li>Cuenta las <b>fichas netas</b> que ganas o pierdes en todos los juegos durante el día, la semana (lunes a domingo) o el mes, en hora de la Ciudad de México.</li>
          <li>Reiniciar tus fichas gratis no suma ni resta: sólo cuenta lo que pasa en las mesas.</li>
          <li>Son fichas virtuales sin valor: el ranking no da premios. Es sólo para presumir.</li>
          <li>Aparecen las primeras 50 personas con al menos una ronda en el periodo. Sólo se guarda un identificador anónimo; tu nombre se muestra según tu cuenta.</li>
        </ul>
      </section>
    </Page>
  );
}
