/**
 * Genera dist-artifact/casino-pepon.html: la página de entrada para publicar
 * la build en claude.ai como Artifact. La plataforma envuelve la página en su
 * propio <!doctype>/<head>/<body>, así que aquí van sólo el título, los estilos
 * y los scripts de la build.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = new URL('../dist-artifact/', import.meta.url).pathname;
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)].map((m) => m[1]);
if (!scripts.length || !styles.length) throw new Error('No se encontraron los recursos de la build');

const page = `<title>Casino Pepón</title>
<meta name="description" content="Póker, blackjack, ruleta y 7 juegos más con fichas virtuales sin valor real, rivales de IA, coach y ranking.">
<meta name="theme-color" content="#0b2a1f">
${styles.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
<style>
  /* En claude.ai la plataforma ya separa la página de las barras del sistema (arriba y abajo). */
  :root { --safe-t: 0px; --safe-b: 0px; color-scheme: dark; }
  html, body { background: #06100c; }
  .game-page { height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
  .onboarding { min-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
</style>
<div id="root"></div>
<noscript>Casino Pepón necesita JavaScript para funcionar.</noscript>
${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
`;
writeFileSync(join(dir, 'casino-pepon.html'), page);

// Lista de archivos a publicar junto a la página.
const files = {};
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const rel = relative(dir, p);
      if (rel === 'index.html' || rel === 'casino-pepon.html' || rel === 'files.json') continue;
      files[rel] = `dist-artifact/${rel}`;
    }
  }
};
walk(dir);
writeFileSync(join(dir, 'files.json'), JSON.stringify(files, null, 2));
console.log(`casino-pepon.html + ${Object.keys(files).length} archivos`);
