import { lazy, Suspense, useEffect, useState } from 'react';
import { ProfileProvider, useProfile } from './store';
import { AnnouncerProvider } from './announcer';
import { useRoute } from './router';
import { Lobby } from './screens/Lobby';
import { Onboarding } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { History } from './screens/History';
import { HowItWorks } from './screens/HowItWorks';
import { Modal } from './components/Modal';
import { navigate } from './router';

const PokerScreen = lazy(() => import('./poker/PokerScreen').then((m) => ({ default: m.PokerScreen })));
const BlackjackScreen = lazy(() => import('./blackjack/BlackjackScreen').then((m) => ({ default: m.BlackjackScreen })));
const RouletteScreen = lazy(() => import('./roulette/RouletteScreen').then((m) => ({ default: m.RouletteScreen })));

/** Recordatorio de pausa opcional, sin presión: sólo informa. */
function BreakReminder() {
  const { profile } = useProfile();
  const minutes = profile.settings.breakReminder;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!minutes) return;
    const t = window.setInterval(() => setOpen(true), minutes * 60_000);
    return () => window.clearInterval(t);
  }, [minutes]);
  return (
    <Modal open={open} title="¿Un descanso?" onClose={() => setOpen(false)} size="sm"
      footer={<><button className="btn btn-ghost" onClick={() => { setOpen(false); navigate('lobby'); }}>Ir al inicio</button><button className="btn btn-gold" onClick={() => setOpen(false)}>Seguir</button></>}>
      <p>Llevas {minutes} minutos jugando. Estirarte, tomar agua o descansar la vista siempre ayuda. Tus fichas y tu mesa te esperan.</p>
    </Modal>
  );
}

function Routes() {
  const { profile } = useProfile();
  const { route } = useRoute();
  useEffect(() => {
    const titles: Record<string, string> = {
      lobby: 'Casino Pepón', poker: 'Póker · Casino Pepón', blackjack: 'Blackjack · Casino Pepón', roulette: 'Ruleta · Casino Pepón',
      stats: 'Estadísticas · Casino Pepón', history: 'Historial · Casino Pepón', how: 'Cómo funciona · Casino Pepón', settings: 'Ajustes · Casino Pepón',
    };
    document.title = titles[route] ?? 'Casino Pepón';
  }, [route]);
  if (!profile.onboardingDone) return <Onboarding />;
  const fallback = <div className="loading-screen" role="status">Cargando mesa…</div>;
  switch (route) {
    case 'poker': return <Suspense fallback={fallback}><PokerScreen /></Suspense>;
    case 'blackjack': return <Suspense fallback={fallback}><BlackjackScreen /></Suspense>;
    case 'roulette': return <Suspense fallback={fallback}><RouletteScreen /></Suspense>;
    case 'stats': return <Stats />;
    case 'history': return <History />;
    case 'how': return <HowItWorks />;
    case 'settings': return <Settings />;
    default: return <Lobby />;
  }
}

export function App() {
  return (
    <ProfileProvider>
      <AnnouncerProvider>
        <a className="skip-link" href="#main">Saltar al contenido</a>
        <Routes />
        <BreakReminder />
      </AnnouncerProvider>
    </ProfileProvider>
  );
}
