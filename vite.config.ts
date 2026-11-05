/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/** Política de seguridad de contenido estricta (sólo en la build de producción). */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'casino-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    // En claude.ai la página la sirve y encuadra la plataforma: sin CSP propia ni service worker.
    mode === 'artifact' ? null : cspPlugin(),
    VitePWA({
      disable: mode === 'artifact',
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Casino Pepón — fichas virtuales',
        short_name: 'Casino Pepón',
        description:
          'Póker Texas Hold\'em, blackjack y ruleta europea con fichas virtuales sin valor real, rivales de IA y un coach que explica cada jugada.',
        lang: 'es-MX',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#07110d',
        theme_color: '#0b2a1f',
        categories: ['games', 'education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, outDir: mode === 'artifact' ? 'dist-artifact' : 'dist', chunkSizeWarningLimit: 600 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
}));
