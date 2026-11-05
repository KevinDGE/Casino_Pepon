/**
 * Tipografías empaquetadas (sin CDN, funcionan offline y respetan la CSP):
 * Playfair Display (títulos) e Inter (texto), sólo el subconjunto latino.
 */
import playfair from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url';
import playfairItalic from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2?url';
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';

const RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

export function loadFonts(): void {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  const faces = [
    new FontFace('Playfair Display Variable', `url(${playfair}) format('woff2')`, { weight: '400 900', style: 'normal', unicodeRange: RANGE, display: 'swap' }),
    new FontFace('Playfair Display Variable', `url(${playfairItalic}) format('woff2')`, { weight: '400 900', style: 'italic', unicodeRange: RANGE, display: 'swap' }),
    new FontFace('Inter Variable', `url(${inter}) format('woff2')`, { weight: '100 900', style: 'normal', unicodeRange: RANGE, display: 'swap' }),
  ];
  for (const f of faces) {
    document.fonts.add(f);
    f.load().catch(() => undefined);
  }
}
