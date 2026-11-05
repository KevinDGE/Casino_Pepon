/** Arte vectorial original: símbolos de tragamonedas, dados e ilustraciones del lobby. */
import type { SlotSymbol } from '../../engine/slots/slots';
import { LogoMark } from './Logo';

export function SlotIcon({ s, size = 64 }: { s: SlotSymbol; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true as const, focusable: false as const };
  switch (s) {
    case 'pepon':
      return <LogoMark size={size} />;
    case 'siete':
      return (
        <svg {...common}>
          <defs><linearGradient id="s7" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff6b7a" /><stop offset="1" stopColor="#b3122a" /></linearGradient></defs>
          <path d="M14 12h36l-18 42h-11l15-33H14z" fill="url(#s7)" stroke="#f6dc96" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      );
    case 'corona':
      return (
        <svg {...common}>
          <defs><linearGradient id="scr" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff1c4" /><stop offset="1" stopColor="#c8952f" /></linearGradient></defs>
          <path d="M8 46 12 18l13 14 7-20 7 20 13-14 4 28z" fill="url(#scr)" stroke="#7a5a1c" strokeWidth="2" strokeLinejoin="round" />
          <rect x="8" y="46" width="48" height="8" rx="2" fill="#c8952f" stroke="#7a5a1c" strokeWidth="2" />
          <circle cx="32" cy="38" r="4" fill="#e0475a" /><circle cx="19" cy="40" r="3" fill="#3fb1c7" /><circle cx="45" cy="40" r="3" fill="#3fb1c7" />
        </svg>
      );
    case 'diamante':
      return (
        <svg {...common}>
          <defs><linearGradient id="sdm" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#c9f1ff" /><stop offset="0.5" stopColor="#3fa9f5" /><stop offset="1" stopColor="#1b4fb8" /></linearGradient></defs>
          <path d="M16 12h32l10 14-26 30L6 26z" fill="url(#sdm)" stroke="#e6f7ff" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 26h52M24 12l-4 14 12 30 12-30-4-14" fill="none" stroke="#e6f7ff" strokeWidth="1.5" opacity="0.8" />
        </svg>
      );
    case 'campana':
      return (
        <svg {...common}>
          <defs><linearGradient id="scb" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#fff1c4" /><stop offset="1" stopColor="#c8952f" /></linearGradient></defs>
          <path d="M32 8c-10 0-16 8-16 18v10l-6 8h44l-6-8V26c0-10-6-18-16-18z" fill="url(#scb)" stroke="#7a5a1c" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="32" cy="50" r="5" fill="#c8952f" stroke="#7a5a1c" strokeWidth="2" />
        </svg>
      );
    case 'estrella':
      return (
        <svg {...common}>
          <defs><radialGradient id="sst" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#fff6cf" /><stop offset="1" stopColor="#f0a500" /></radialGradient></defs>
          <path d="M32 6l7.6 16.2 17.4 2.2-12.8 12 3.3 17.4L32 45.4l-15.5 8.4 3.3-17.4-12.8-12 17.4-2.2z" fill="url(#sst)" stroke="#a86a00" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'cereza':
      return (
        <svg {...common}>
          <path d="M22 40c4-14 10-24 22-30M42 42c0-12 0-22 2-32" fill="none" stroke="#2e8b3e" strokeWidth="3" strokeLinecap="round" />
          <path d="M44 10c6-2 10 0 12 4-5 2-9 1-12-4z" fill="#3fae4f" />
          <circle cx="20" cy="46" r="11" fill="#d41f3a" stroke="#7d0f20" strokeWidth="2" />
          <circle cx="42" cy="48" r="11" fill="#e3283f" stroke="#7d0f20" strokeWidth="2" />
          <circle cx="16" cy="42" r="3" fill="#ffb3bd" /><circle cx="38" cy="44" r="3" fill="#ffb3bd" />
        </svg>
      );
  }
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

export function DieFace({ n, size = 56, rolling = false }: { n: number; size?: number; rolling?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`die ${rolling ? 'die-roll' : ''}`} role="img" aria-label={`Dado: ${n}`}>
      <defs>
        <linearGradient id="die-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e7dfcc" /></linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="20" fill="url(#die-g)" stroke="#b9892f" strokeWidth="3" />
      {(PIPS[n] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={n === 1 || n === 4 ? '#c3202f' : '#151a22'} />)}
    </svg>
  );
}

/** Ilustraciones del lobby (una por juego). */
export function GameArt({ game }: { game: string }) {
  const card = (x: number, y: number, r: number, label: string, red = false, key?: string) => (
    <g key={key ?? label + x} transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-15" y="-21" width="30" height="42" rx="4" fill="#fbf8ef" stroke="rgba(0,0,0,.25)" />
      <text x="-10" y="-7" fontSize="11" fontWeight="800" fill={red ? '#c3202f' : '#151a22'} fontFamily="sans-serif">{label}</text>
    </g>
  );
  const box = (children: React.ReactNode) => (
    <svg viewBox="0 0 160 90" className="game-art" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ga-felt" cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#1d7a57" /><stop offset="1" stopColor="#0a2e22" /></radialGradient>
      </defs>
      <rect width="160" height="90" rx="12" fill="url(#ga-felt)" />
      {children}
    </svg>
  );
  switch (game) {
    case 'poker':
      return box(<>{card(62, 48, -14, 'A♠')}{card(80, 44, 0, 'A♥', true)}{card(98, 48, 14, 'K♦', true)}<circle cx="130" cy="70" r="11" fill="#c8283c" stroke="#f4ecd8" strokeWidth="3" strokeDasharray="4 3" /><circle cx="30" cy="68" r="11" fill="#2563eb" stroke="#f4ecd8" strokeWidth="3" strokeDasharray="4 3" /></>);
    case 'blackjack':
      return box(<>{card(68, 46, -10, 'A♣')}{card(90, 46, 8, 'K♥', true)}<text x="122" y="30" fontSize="20" fontWeight="900" fill="#f6dc96" fontFamily="serif">21</text></>);
    case 'roulette':
      return box(<g transform="translate(80 45)">{Array.from({ length: 18 }, (_, i) => <path key={i} d="M0 0 L34 -6 A34 34 0 0 1 34 6 Z" fill={i === 0 ? '#13824f' : i % 2 ? '#b3202f' : '#14171c'} transform={`rotate(${i * 20})`} />)}<circle r="34" fill="none" stroke="#e3bd62" strokeWidth="2" /><circle r="14" fill="#c8952f" /><circle cx="0" cy="-26" r="3.5" fill="#fff" /></g>);
    case 'videopoker':
      return box(<><rect x="16" y="14" width="128" height="62" rx="8" fill="#0b1630" stroke="#3fa9f5" strokeWidth="2" />{['J♠', 'J♥', '7♣', 'Q♦', '2♠'].map((l, i) => card(36 + i * 22, 45, 0, l, l.includes('♥') || l.includes('♦'), l + i))}<text x="24" y="26" fontSize="8" fill="#7fd0ff" fontFamily="sans-serif" fontWeight="700">CONSERVAR</text></>);
    case 'baccarat':
      return box(<><rect x="14" y="18" width="60" height="54" rx="10" fill="rgba(37,99,235,.35)" stroke="#7c9cff" /><rect x="86" y="18" width="60" height="54" rx="10" fill="rgba(200,40,60,.35)" stroke="#ff7a85" /><text x="44" y="52" textAnchor="middle" fontSize="22" fontWeight="900" fill="#dfe6ff" fontFamily="serif">P</text><text x="116" y="52" textAnchor="middle" fontSize="22" fontWeight="900" fill="#ffe0e4" fontFamily="serif">B</text></>);
    case 'trescartas':
      return box(<>{card(58, 46, -12, 'Q♠')}{card(80, 44, 0, 'Q♥', true)}{card(102, 46, 12, 'Q♦', true)}</>);
    case 'dados':
      return box(<><g transform="translate(34 22) rotate(-10)"><rect width="34" height="34" rx="7" fill="#fbf8ef" /><circle cx="10" cy="10" r="3.5" fill="#151a22" /><circle cx="24" cy="24" r="3.5" fill="#151a22" /><circle cx="17" cy="17" r="3.5" fill="#151a22" /></g><g transform="translate(70 34) rotate(8)"><rect width="34" height="34" rx="7" fill="#fbf8ef" /><circle cx="17" cy="17" r="4.5" fill="#c3202f" /></g><g transform="translate(104 18) rotate(18)"><rect width="34" height="34" rx="7" fill="#fbf8ef" />{[[9, 9], [25, 9], [9, 25], [25, 25], [9, 17], [25, 17]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="#151a22" />)}</g></>);
    case 'tragamonedas':
      return box(<><rect x="18" y="12" width="124" height="66" rx="10" fill="#2a0f16" stroke="#e3bd62" strokeWidth="2" />{[0, 1, 2].map((i) => <rect key={i} x={26 + i * 38} y="20" width="32" height="50" rx="6" fill="#fbf8ef" />)}<text x="42" y="54" textAnchor="middle" fontSize="26" fontWeight="900" fill="#c3202f" fontFamily="serif">7</text><text x="80" y="54" textAnchor="middle" fontSize="26" fontWeight="900" fill="#c3202f" fontFamily="serif">7</text><text x="118" y="54" textAnchor="middle" fontSize="26" fontWeight="900" fill="#c3202f" fontFamily="serif">7</text></>);
    case 'keno':
      return box(<>{Array.from({ length: 24 }, (_, i) => <circle key={i} cx={22 + (i % 8) * 16.5} cy={22 + Math.floor(i / 8) * 22} r="7" fill={[2, 5, 11, 14, 19, 21].includes(i) ? '#e3bd62' : 'rgba(255,255,255,.14)'} />)}</>);
    case 'mayormenor':
      return box(<>{card(80, 46, 0, '8♣')}<path d="M118 52 l14 -16 l14 16 z" fill="#4ade80" /><path d="M14 38 l14 16 l14 -16 z" fill="#ff7a85" /></>);
    default:
      return box(null);
  }
}
