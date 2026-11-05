import { useState } from 'react';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { GameArt } from '../components/Art';
import { PlayingCard } from '../components/PlayingCard';
import { ConfirmDialog } from '../components/Modal';
import { hrefFor, navigate } from '../router';
import { useProfile } from '../store';
import { fmtChips, fmtSignedChips } from '../../coach/format';
import { useMyTotals } from '../ranking/useRanking';
import { loadSession } from '../../persistence/storage';
import { STARTING_CHIPS } from '../../persistence/schema';
import { GAMES, CATEGORY_NAMES, type GameCategory } from '../games';
import { parseCards } from '../../core/cards';

const FAN = parseCards('As Kh Qd Jc Ts');

export function Lobby() {
  const { profile, resetChips } = useProfile();
  const [confirm, setConfirm] = useState(false);
  const [cat, setCat] = useState<GameCategory | 'todos'>('todos');
  const table = loadSession<{ stack: number }>('poker');
  const low = profile.chips < 500;
  const mine = useMyTotals();
  const week = mine.weekNet;
  const list = GAMES.filter((g) => cat === 'todos' || g.category === cat);
  const played = profile.stats.poker.hands + profile.stats.blackjack.rounds + profile.stats.roulette.spins + Object.values(profile.stats.arcade).reduce((a, s) => a + s.rounds, 0);
  return (
    <Page current="lobby">
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-text">
          <p className="eyebrow">Fichas virtuales · sin dinero real · {GAMES.length} juegos</p>
          <h1 className="hero-title"><span className="gold-text">Casino Pepón</span><br /><span className="hero-sub-title">Juega con cabeza, aprende con el coach</span></h1>
          <p className="hero-sub">Rivales de IA que juegan limpio, probabilidades exactas a la vista y un coach que te explica cada jugada.</p>
          <div className="hero-ctas">
            <button className="btn btn-gold btn-lg shine" onClick={() => navigate('poker')}>Jugar Texas Hold’em</button>
            <button className="btn btn-ghost btn-lg" onClick={() => document.getElementById('juegos')?.scrollIntoView({ behavior: 'smooth' })}>Ver todos los juegos</button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-fan">
            {FAN.map((c, i) => <span key={c} className="fan-card" style={{ ['--i' as string]: i - 2 }}><PlayingCard card={c} size="lg" animate={false} /></span>)}
          </div>
          <div className="hero-chips">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`hchip hchip-${i}`} />)}
          </div>
        </div>
        <div className="hero-balance">
          <span className="hero-balance-label">Tus fichas</span>
          <span className="hero-balance-num">{fmtChips(profile.chips)}</span>
          {table?.stack ? <span className="hero-balance-extra">+{fmtChips(table.stack)} en una mesa de póker</span> : null}
          <span className="hero-balance-extra">{played.toLocaleString('es-MX')} rondas jugadas</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>
            <Icon name="refresh" size={18} /> Reiniciar fichas gratis
          </button>
        </div>
      </section>
      {low ? (
        <div className="notice" role="status">
          Te quedan pocas fichas. Puedes <button className="link-btn" onClick={() => setConfirm(true)}>reiniciarlas gratis a {fmtChips(STARTING_CHIPS)}</button> cuando quieras.
        </div>
      ) : null}
      <div className="cat-bar" id="juegos" role="radiogroup" aria-label="Categoría de juegos">
        {(Object.keys(CATEGORY_NAMES) as (GameCategory | 'todos')[]).map((k) => (
          <button key={k} role="radio" aria-checked={cat === k} className={`cat-chip ${cat === k ? 'active' : ''}`} onClick={() => setCat(k)}>
            {CATEGORY_NAMES[k]} <small>{k === 'todos' ? GAMES.length : GAMES.filter((g) => g.category === k).length}</small>
          </button>
        ))}
      </div>
      <section className="game-grid" aria-label="Juegos">
        {list.map((g, idx) => (
          <button key={g.route} className="game-card" onClick={() => navigate(g.route)} style={{ animationDelay: `${idx * 45}ms` }} aria-label={`${g.name}: ${g.tag}. ${g.edge}`}>
            <span className="game-art-wrap"><GameArt game={g.route} /></span>
            <span className="game-badges">
              {g.isNew ? <span className="badge badge-new">Nuevo</span> : null}
              {g.smart ? <span className="badge badge-smart">{g.smart}</span> : null}
            </span>
            <span className="game-name">{g.name}</span>
            <span className="game-tag">{g.tag}</span>
            <span className="game-desc">{g.desc}</span>
            <span className="game-foot">
              <span className="game-edge" title="Transparencia: retorno o ventaja de la casa">{g.edge}</span>
              <span className="game-cta">Jugar <Icon name="chevron" size={18} /></span>
            </span>
          </button>
        ))}
      </section>
      <section className="lobby-info">
        <div className="info-card">
          <h2>Azar justo y verificable</h2>
          <p>Todo se baraja y se tira con <code>crypto.getRandomValues</code> y Fisher–Yates. Cada juego publica su RTP o ventaja de la casa exacta.</p>
          <a href={hrefFor('how')}>Cómo funciona →</a>
        </div>
        <div className="info-card">
          <h2>Ranking diario, semanal y mensual</h2>
          <p>Esta semana llevas <b className={week > 0 ? 'good' : week < 0 ? 'bad' : ''}>{fmtSignedChips(week)}</b> fichas en {fmtChips(mine.weekRounds)} rondas. Compite con quienes juegan este casino en línea.</p>
          <a href={hrefFor('ranking')}>Ver ranking →</a>
        </div>
        <div className="info-card">
          <h2>Sin trampas de diseño</h2>
          <p>Sin dinero real, sin compras, sin giros automáticos ni “casi ganas”. Un premio menor que tu apuesta se muestra como pérdida.</p>
          <a href={hrefFor('stats')}>Ver tus estadísticas →</a>
        </div>
      </section>
      <ConfirmDialog
        open={confirm}
        title="Reiniciar fichas"
        message={<p>Tus fichas volverán a {fmtChips(STARTING_CHIPS)}. Es gratis y puedes hacerlo cuando quieras. Tus estadísticas se conservan.</p>}
        confirmText="Reiniciar"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { resetChips(); setConfirm(false); }}
      />
    </Page>
  );
}
