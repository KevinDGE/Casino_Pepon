import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { LogoMark, Wordmark } from './Logo';
import { navigate, type Route } from '../router';
import { useProfile } from '../store';
import { fmtChips } from '../../coach/format';

const NAV: { route: Route; label: string; icon: string; mobile?: boolean }[] = [
  { route: 'lobby', label: 'Inicio', icon: 'home' },
  { route: 'ranking', label: 'Ranking', icon: 'trophy' },
  { route: 'stats', label: 'Estadísticas', icon: 'chart' },
  { route: 'history', label: 'Historial', icon: 'history', mobile: false },
  { route: 'how', label: 'Cómo funciona', icon: 'book' },
  { route: 'settings', label: 'Ajustes', icon: 'gear' },
];

export function ChipBalance({ extra }: { extra?: number }) {
  const { profile } = useProfile();
  return (
    <span className="balance" aria-label={`Fichas virtuales: ${fmtChips(profile.chips)}`} title="Fichas virtuales sin valor real">
      <span className="chip chip-mini chip-gold" aria-hidden="true" />
      <span className="balance-num">{fmtChips(profile.chips)}</span>
      {extra ? <span className="balance-extra">+{fmtChips(extra)} en mesa</span> : null}
    </span>
  );
}

export function TopBar({ title, back, right, current }: { title?: string; back?: boolean; right?: ReactNode; current?: Route }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {back ? (
          <button className="icon-btn" onClick={() => navigate('lobby')} aria-label="Volver al inicio">
            <Icon name="back" />
          </button>
        ) : null}
        <a className={`brand ${title ? 'brand-compact' : ''}`} href="#/" aria-label="Casino Pepón, inicio">
          <LogoMark size={34} />
          {title ? null : <Wordmark />}
        </a>
        {title ? <h1 className="topbar-title">{title}</h1> : null}
      </div>
      <nav className="topnav" aria-label="Principal">
        {NAV.map((n) => (
          <a key={n.route} href={`#/${n.route === 'lobby' ? '' : n.route}`} className={current === n.route ? 'active' : ''} aria-current={current === n.route ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="topbar-right">
        {right}
        <ChipBalance />
      </div>
    </header>
  );
}

export function BottomNav({ current }: { current: Route }) {
  return (
    <nav className="bottomnav" aria-label="Navegación">
      {NAV.filter((n) => n.mobile !== false).map((n) => (
        <a key={n.route} href={`#/${n.route === 'lobby' ? '' : n.route}`} className={current === n.route ? 'active' : ''} aria-current={current === n.route ? 'page' : undefined}>
          <Icon name={n.icon} />
          <span>{n.label === 'Cómo funciona' ? 'Reglas' : n.label}</span>
        </a>
      ))}
    </nav>
  );
}

export function Page({ current, title, children }: { current: Route; title?: string; children: ReactNode }) {
  return (
    <div className="page">
      <TopBar current={current} />
      <main id="main" className="page-main" tabIndex={-1}>
        {title ? <h1 className="page-title">{title}</h1> : null}
        {children}
      </main>
      <BottomNav current={current} />
    </div>
  );
}
