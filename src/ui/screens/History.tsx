import { useState } from 'react';
import { Page } from '../components/Layout';
import { Segmented } from '../components/Controls';
import { PlayingCard } from '../components/PlayingCard';
import { useProfile } from '../store';
import { fmtChips, fmtSignedChips } from '../../coach/format';
import { colorOf } from '../../engine/roulette/roulette';
import { gameName } from '../games';

type Tab = 'poker' | 'blackjack' | 'roulette' | 'mas';
const OUTCOME_ES: Record<string, string> = { blackjack: 'Blackjack', win: 'Ganó', push: 'Empate', lose: 'Perdió', bust: 'Se pasó' };
const GRADE_ES: Record<string, string> = { acierto: '✓', imprecision: '≈', error: '✗' };

const when = (ts: number) => new Date(ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function History() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>('poker');
  const [open, setOpen] = useState<string | null>(null);
  const h = profile.history;
  return (
    <Page current="history" title="Historial">
      <Segmented label="Juego" value={tab} onChange={(v) => { setTab(v); setOpen(null); }} options={[{ value: 'poker', label: 'Póker' }, { value: 'blackjack', label: 'Blackjack' }, { value: 'roulette', label: 'Ruleta' }, { value: 'mas', label: 'Más juegos' }]} />
      <p className="muted small">Se guardan las últimas 100 entradas de cada juego en este dispositivo.</p>
      {tab === 'poker' && (h.poker.length ? (
        <ul className="hist-list">
          {h.poker.map((e) => (
            <li key={e.id} className="hist-item">
              <button className="hist-head" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span className="hist-cards">{e.hole.map((c) => <PlayingCard key={c} card={c} size="xs" animate={false} />)}</span>
                <span className="hist-main"><b>Mano #{e.hand}</b><small>{e.summary}</small></span>
                <span className={`hist-net ${e.net > 0 ? 'good' : e.net < 0 ? 'bad' : ''}`}>{fmtSignedChips(e.net)}</span>
              </button>
              {open === e.id ? (
                <div className="hist-body">
                  <div className="hist-board">{e.board.length ? e.board.map((c) => <PlayingCard key={c} card={c} size="xs" animate={false} />) : <span className="muted">Sin flop</span>}</div>
                  <p className="muted small">{when(e.ts)} · Bote: {fmtChips(e.pot)}</p>
                  <ol className="hist-lines">{e.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
                  {e.review.length ? (
                    <div className="hist-review"><b>Revisión del coach</b>{e.review.map((r, i) => <p key={i} className={`grade-${r.grade}`}>{GRADE_ES[r.grade]} {r.comment}</p>)}</div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="empty">Aún no has jugado manos de póker.</p>)}
      {tab === 'blackjack' && (h.blackjack.length ? (
        <ul className="hist-list">
          {h.blackjack.map((e) => (
            <li key={e.id} className="hist-item">
              <button className="hist-head" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span className="hist-cards">{(e.hands[0]?.cards ?? []).slice(0, 3).map((c, i) => <PlayingCard key={i} card={c} size="xs" animate={false} />)}</span>
                <span className="hist-main"><b>{e.hands.map((x) => OUTCOME_ES[x.outcome] ?? x.outcome).join(' · ')}</b><small>{when(e.ts)}</small></span>
                <span className={`hist-net ${e.net > 0 ? 'good' : e.net < 0 ? 'bad' : ''}`}>{fmtSignedChips(e.net)}</span>
              </button>
              {open === e.id ? (
                <div className="hist-body">
                  <div className="hist-row"><span className="muted">Crupier:</span> {e.dealer.map((c, i) => <PlayingCard key={i} card={c} size="xs" animate={false} />)}</div>
                  {e.hands.map((x, i) => (
                    <div key={i} className="hist-row"><span className="muted">Mano {i + 1} ({fmtChips(x.bet)}):</span> {x.cards.map((c, k) => <PlayingCard key={k} card={c} size="xs" animate={false} />)} <b>{OUTCOME_ES[x.outcome]}</b></div>
                  ))}
                  {e.insuranceNet ? <p className="small">Seguro: {fmtSignedChips(e.insuranceNet)}</p> : null}
                  {e.review.map((r, i) => <p key={i} className={`small grade-${r.grade}`}>{GRADE_ES[r.grade]} {r.comment}</p>)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="empty">Aún no has jugado blackjack.</p>)}
      {tab === 'roulette' && (h.roulette.length ? (
        <ul className="hist-list">
          {h.roulette.map((e) => (
            <li key={e.id} className="hist-item">
              <button className="hist-head" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span className={`num-ball num-${colorOf(e.result)}`}>{e.result}</span>
                <span className="hist-main"><b>{e.bets.length} {e.bets.length === 1 ? 'apuesta' : 'apuestas'}</b><small>{when(e.ts)}</small></span>
                <span className={`hist-net ${e.net > 0 ? 'good' : e.net < 0 ? 'bad' : ''}`}>{fmtSignedChips(e.net)}</span>
              </button>
              {open === e.id ? (
                <ul className="hist-body plain-list">
                  {e.bets.map((b, i) => <li key={i}>{b.desc}: {fmtChips(b.amount)} → {fmtSignedChips(b.net)}</li>)}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="empty">Aún no has girado la ruleta.</p>)}
      {tab === 'mas' && (h.arcade.length ? (
        <ul className="hist-list">
          {h.arcade.map((e) => (
            <li key={e.id} className="hist-item">
              <div className="hist-head">
                <span className="hist-main"><b>{gameName(e.game)}</b><small>{e.summary} · {when(e.ts)}</small></span>
                <span className={`hist-net ${e.net > 0 ? 'good' : e.net < 0 ? 'bad' : ''}`}>{fmtSignedChips(e.net)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="empty">Aún no has jugado los demás juegos.</p>)}
    </Page>
  );
}
