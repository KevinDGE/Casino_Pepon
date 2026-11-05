import { useState } from 'react';
import { Page } from '../components/Layout';
import { Segmented } from '../components/Controls';
import { useProfile } from '../store';
import { fmtChips, fmtPct, fmtSignedChips } from '../../coach/format';
import { TAG_TEXT, type PokerMistakeTag } from '../../coach/pokerCoach';
import { BJ_TAG_TEXT, type BJTag } from '../../coach/blackjackCoach';
import { BET_NAMES_ES, colorOf, type BetKind } from '../../engine/roulette/roulette';

type Tab = 'poker' | 'blackjack' | 'roulette';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Accuracy({ good, inacc, errors }: { good: number; inacc: number; errors: number }) {
  const total = good + inacc + errors;
  if (!total) return <p className="muted">Activa el coach y juega algunas manos para ver tu precisión.</p>;
  const w = (x: number) => `${(x / total) * 100}%`;
  return (
    <div>
      <div className="acc-bar" role="img" aria-label={`Aciertos ${fmtPct(good / total)}, imprecisiones ${fmtPct(inacc / total)}, errores ${fmtPct(errors / total)}`}>
        <span className="acc-good" style={{ width: w(good) }} />
        <span className="acc-inacc" style={{ width: w(inacc) }} />
        <span className="acc-err" style={{ width: w(errors) }} />
      </div>
      <div className="acc-legend">
        <span><i className="dot dot-good" />Aciertos {fmtPct(good / total)}</span>
        <span><i className="dot dot-inacc" />Imprecisiones {fmtPct(inacc / total)}</span>
        <span><i className="dot dot-err" />Errores {fmtPct(errors / total)}</span>
      </div>
    </div>
  );
}

function Improvements({ tags, texts }: { tags: Record<string, number>; texts: Record<string, { title: string; tip: string }> }) {
  const list = Object.entries(tags).filter(([k]) => texts[k]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!list.length) return <p className="muted">Sin áreas de mejora detectadas todavía. ¡Sigue así!</p>;
  return (
    <ol className="improve-list">
      {list.map(([k, n]) => (
        <li key={k}>
          <b>{texts[k]!.title}</b> <span className="muted">({n} {n === 1 ? 'vez' : 'veces'})</span>
          <p>{texts[k]!.tip}</p>
        </li>
      ))}
    </ol>
  );
}

export function Stats() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>('poker');
  const p = profile.stats.poker;
  const b = profile.stats.blackjack;
  const r = profile.stats.roulette;
  const tone = (n: number) => (n > 0 ? 'good' : n < 0 ? 'bad' : undefined);
  return (
    <Page current="stats" title="Estadísticas">
      <Segmented label="Juego" value={tab} onChange={setTab} options={[{ value: 'poker', label: 'Póker' }, { value: 'blackjack', label: 'Blackjack' }, { value: 'roulette', label: 'Ruleta' }]} />
      {tab === 'poker' ? (
        <>
          <section className="stat-grid">
            <Stat label="Manos" value={fmtChips(p.hands)} />
            <Stat label="Manos ganadas" value={p.hands ? fmtPct(p.handsWon / p.hands) : '—'} />
            <Stat label="Resultado" value={fmtSignedChips(p.net)} tone={tone(p.net)} />
            <Stat label="Bote más grande" value={fmtChips(p.biggestPot)} />
            <Stat label="VPIP (manos jugadas)" value={p.hands ? fmtPct(p.vpip / p.hands) : '—'} />
            <Stat label="PFR (subidas preflop)" value={p.hands ? fmtPct(p.pfr / p.hands) : '—'} />
            <Stat label="Showdowns ganados" value={p.showdowns ? fmtPct(p.showdownsWon / p.showdowns) : '—'} />
            <Stat label="Mesas ganadas" value={`${p.tablesWon} / ${p.tablesPlayed}`} />
          </section>
          <section className="panel">
            <h2 className="panel-title">Precisión según el coach</h2>
            <Accuracy good={p.good} inacc={p.inaccuracies} errors={p.errors} />
            {p.decisions ? <p className="muted small">{p.decisions} decisiones revisadas · EV perdido promedio: {(p.evLossBB / p.decisions).toFixed(2)} BB por decisión</p> : null}
          </section>
          <section className="panel">
            <h2 className="panel-title">Áreas de mejora</h2>
            <Improvements tags={p.tags} texts={TAG_TEXT as Record<PokerMistakeTag, { title: string; tip: string }>} />
            <p className="muted small">Referencia: un jugador sólido suele tener VPIP entre 18% y 28% en mesas de 6, y más amplio en mano a mano.</p>
          </section>
        </>
      ) : null}
      {tab === 'blackjack' ? (
        <>
          <section className="stat-grid">
            <Stat label="Rondas" value={fmtChips(b.rounds)} />
            <Stat label="Resultado" value={fmtSignedChips(b.net)} tone={tone(b.net)} />
            <Stat label="Apostado" value={fmtChips(b.wagered)} />
            <Stat label="Retorno" value={b.wagered ? fmtPct((b.wagered + b.net) / b.wagered, 1) : '—'} />
            <Stat label="Ganadas" value={fmtChips(b.wins)} />
            <Stat label="Perdidas" value={fmtChips(b.losses)} />
            <Stat label="Empates" value={fmtChips(b.pushes)} />
            <Stat label="Blackjacks" value={fmtChips(b.blackjacks)} />
          </section>
          <section className="panel">
            <h2 className="panel-title">Precisión según el coach</h2>
            <Accuracy good={b.good} inacc={b.inaccuracies} errors={b.errors} />
            {b.decisions ? <p className="muted small">{b.decisions} decisiones · costo promedio de errores: {((b.evLoss / b.decisions) * 100).toFixed(2)}% de la apuesta</p> : null}
          </section>
          <section className="panel">
            <h2 className="panel-title">Áreas de mejora</h2>
            <Improvements tags={b.tags} texts={BJ_TAG_TEXT as Record<BJTag, { title: string; tip: string }>} />
          </section>
        </>
      ) : null}
      {tab === 'roulette' ? (
        <>
          <section className="stat-grid">
            <Stat label="Giros" value={fmtChips(r.spins)} />
            <Stat label="Apostado" value={fmtChips(r.wagered)} />
            <Stat label="Resultado real" value={fmtSignedChips(r.net)} tone={tone(r.net)} />
            <Stat label="Pérdida esperada" value={fmtSignedChips(-r.expectedLoss)} />
            <Stat label="Mayor ganancia" value={fmtChips(r.biggestWin)} />
          </section>
          <section className="panel">
            <h2 className="panel-title">Lo esperado vs. lo real</h2>
            <p>
              Con {fmtChips(r.wagered)} fichas apostadas, la ventaja de la casa (2.70%) predice una pérdida de {fmtChips(r.expectedLoss)}.
              Tu resultado real fue {fmtSignedChips(r.net)}. La diferencia es suerte (varianza): a largo plazo, el resultado se acerca a lo esperado.
            </p>
          </section>
          <section className="panel">
            <h2 className="panel-title">Apuestas que más usas</h2>
            {Object.keys(r.betsByKind).length ? (
              <ul className="plain-list">
                {Object.entries(r.betsByKind).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => (
                  <li key={k}>{BET_NAMES_ES[k as BetKind] ?? k}: {n}</li>
                ))}
              </ul>
            ) : <p className="muted">Aún no hay apuestas.</p>}
            <h3 className="sub-title">Frecuencia de números</h3>
            <div className="freq-grid" role="list">
              {r.numbers.map((n, i) => (
                <span key={i} role="listitem" className={`freq num-${colorOf(i)}`} title={`${i}: ${n}`}>
                  <b>{i}</b><small>{n}</small>
                </span>
              ))}
            </div>
            <p className="muted small">Los números “calientes” o “fríos” no predicen nada: cada giro es independiente.</p>
          </section>
        </>
      ) : null}
    </Page>
  );
}
