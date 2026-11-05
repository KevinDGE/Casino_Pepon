import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/styles-games.css';
import { loadFonts } from './ui/fonts';

loadFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: registrar el service worker (funciona offline tras la primera carga).
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'artifact') {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
