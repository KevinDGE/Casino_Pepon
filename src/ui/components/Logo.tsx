/** Identidad visual original: ficha con monograma "P" y corona de tres puntos. */
export function LogoMark({ size = 40 }: { size?: number }) {
  const notches = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="lg-chip" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#1d7a57" />
          <stop offset="100%" stopColor="#0a3326" />
        </radialGradient>
        <linearGradient id="lg-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f8e3a3" />
          <stop offset="55%" stopColor="#e1b453" />
          <stop offset="100%" stopColor="#a87b25" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#lg-chip)" stroke="url(#lg-gold)" strokeWidth="3" />
      {notches.map((a) => (
        <rect key={a} x="29" y="3.5" width="6" height="9" rx="1.5" fill="#f4ecd8" transform={`rotate(${a} 32 32)`} opacity="0.92" />
      ))}
      <circle cx="32" cy="32" r="19" fill="none" stroke="url(#lg-gold)" strokeWidth="1.5" strokeDasharray="2 3" />
      <path d="M26 44V21h8.5a7 7 0 0 1 0 14H26" fill="none" stroke="url(#lg-gold)" strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="25" cy="16.5" r="1.7" fill="#f8e3a3" />
      <circle cx="32" cy="14.5" r="2" fill="#f8e3a3" />
      <circle cx="39" cy="16.5" r="1.7" fill="#f8e3a3" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      Casino <em>Pepón</em>
    </span>
  );
}
