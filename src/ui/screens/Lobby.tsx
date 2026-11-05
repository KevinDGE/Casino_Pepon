import { useState } from 'react';
import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { navigate } from '../router';
import { useProfile } from '../store';
import { fmtChips } from '../../coach/format';
import { loadSession } from '../../persistence/storage';
import { STARTING_CHIPS } from '../../persistence/schema';

const GAMES = [
  {
    route: 'poker' as const,
    name: 'Texas Hold’em',
    tag: 'No-Limit · 1 a 5 rivales de IA',
    desc: 'Ciegas, botes secundarios y all-ins con rivales de cuatro niveles. El Experto calcula equity, rangos y pot odds.',
    icon: 'spade',
    accent: 'emerald',
  },
  {
    route: 'blackjack' as const,
    name: 'Blackjack',
    tag: 'Reglas configurables',
    desc: 'Pedir, plantarse, doblar, dividir y seguro. El coach calcula el valor esperado de cada acción.',
    icon: 'cards',
    accent: 'ruby',
  },
  {
    route: 'roulette' as const,
    name: 'Ruleta europea',
    tag: 'Un solo cero · 37 casillas',
    desc: 'Todas las apuestas principales, historial y probabilidades claras. Sin estrategias mágicas.',
    icon: 'wheel',
    accent: 'gold',
  },
];

export function Lobby() {
  const { profile, resetChips } = useProfile();
  const [confirm, setConfirm] = useState(false);
  const table = loadSession<{ stack: number }>('poker');
  const low = profile.chips < 500;
  return (
    <Page current="lobby">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Fichas virtuales · sin dinero real</p>
          <h1 className="hero-title">Juega con cabeza, <span>aprende con el coach</span></h1>
          <p className="hero-sub">Rivales de IA que juegan limpio, explicaciones claras y probabilidades a la vista.</p>
        </div>
        <div className="hero-balance">
          <span className="hero-balance-label">Tus fichas</span>
          <span className="hero-balance-num">{fmtChips(profile.chips)}</span>
          {table?.stack ? <span className="hero-balance-extra">+{fmtChips(table.stack)} en una mesa de póker</span> : null}
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
      <section className="game-grid" aria-label="Juegos">
        {GAMES.map((g, idx) => (
          <button key={g.route} className={`game-card accent-${g.accent}`} onClick={() => navigate(g.route)} style={{ animationDelay: `${idx * 70}ms` }}>
            <span className="game-icon" aria-hidden="true"><Icon name={g.icon} size={30} /></span>
            <span className="game-name">{g.name}</span>
            <span className="game-tag">{g.tag}</span>
            <span className="game-desc">{g.desc}</span>
            <span className="game-cta">Jugar <Icon name="chevron" size={18} /></span>
          </button>
        ))}
      </section>
      <section className="lobby-info">
        <div className="info-card">
          <h2>Azar justo</h2>
          <p>Las cartas y la ruleta usan <code>crypto.getRandomValues</code> con barajado Fisher–Yates sin sesgo.</p>
          <a href="#/how">Cómo funciona →</a>
        </div>
        <div className="info-card">
          <h2>Tu progreso</h2>
          <p>{profile.stats.poker.hands} manos de póker · {profile.stats.blackjack.rounds} rondas de blackjack · {profile.stats.roulette.spins} giros.</p>
          <a href="#/stats">Ver estadísticas →</a>
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
