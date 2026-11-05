import { WHEEL_ORDER, colorOf } from '../../engine/roulette/roulette';

const STEP = 360 / 37;

/** Rueda europea en SVG. `rotation` gira la rueda; `ballRotation` gira la bola. */
export function Wheel({ rotation, ballRotation, spinning, duration, result }: {
  rotation: number; ballRotation: number; spinning: boolean; duration: number; result: number | null;
}) {
  const R = 100;
  const pockets = WHEEL_ORDER.map((n, i) => {
    const a0 = ((i - 0.5) * STEP - 90) * (Math.PI / 180);
    const a1 = ((i + 0.5) * STEP - 90) * (Math.PI / 180);
    const ro = R * 0.92, ri = R * 0.62;
    const p = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
    const d = `M${p(ri, a0)} L${p(ro, a0)} A${ro},${ro} 0 0 1 ${p(ro, a1)} L${p(ri, a1)} A${ri},${ri} 0 0 0 ${p(ri, a0)} Z`;
    const am = (i * STEP - 90) * (Math.PI / 180);
    const tx = Math.cos(am) * R * 0.8, ty = Math.sin(am) * R * 0.8;
    const fill = colorOf(n) === 'green' ? '#13824f' : colorOf(n) === 'red' ? '#b3202f' : '#14171c';
    return (
      <g key={n}>
        <path d={d} fill={fill} stroke="#d9b45a" strokeWidth="0.6" />
        <text x={tx} y={ty} fill="#f7f2e4" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * STEP} ${tx} ${ty})`}>{n}</text>
      </g>
    );
  });
  const t = spinning ? `transform ${duration}ms cubic-bezier(0.12, 0.6, 0.12, 1)` : 'none';
  return (
    <div className="wheel-wrap">
      <svg viewBox="-110 -110 220 220" className="wheel-svg" role="img" aria-label={result === null ? 'Ruleta europea' : `La bola cayó en el ${result}`}>
        <defs>
          <radialGradient id="wh-wood" cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor="#3a2414" />
            <stop offset="100%" stopColor="#1e1209" />
          </radialGradient>
          <radialGradient id="wh-cone" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#f6dc96" />
            <stop offset="60%" stopColor="#b9892f" />
            <stop offset="100%" stopColor="#5e4314" />
          </radialGradient>
        </defs>
        <circle r="108" fill="url(#wh-wood)" stroke="#9c7a2b" strokeWidth="2" />
        <circle r="96" fill="#0b1a14" />
        <g style={{ transform: `rotate(${rotation}deg)`, transition: t }}>
          {pockets}
          <circle r={R * 0.6} fill="#0f2a1f" stroke="#d9b45a" strokeWidth="1" />
          <circle r={R * 0.34} fill="url(#wh-cone)" />
          {[0, 45, 90, 135].map((a) => <rect key={a} x="-2.5" y={-R * 0.55} width="5" height={R * 1.1} rx="2.5" fill="#e3bd62" transform={`rotate(${a})`} opacity="0.9" />)}
          <circle r="7" fill="#f6dc96" stroke="#7a5a1c" />
        </g>
        <g style={{ transform: `rotate(${ballRotation}deg)`, transition: spinning ? `transform ${duration}ms cubic-bezier(0.2, 0.7, 0.25, 1)` : 'none' }}>
          <circle cx="0" cy={-R * 0.7} r="5" fill="#fbfbf6" stroke="#9aa0a6" strokeWidth="0.8" />
        </g>
        <path d="M0,-104 l-5,-6 h10 z" fill="#f6dc96" />
      </svg>
    </div>
  );
}

export function pocketIndex(n: number): number {
  return WHEEL_ORDER.indexOf(n as (typeof WHEEL_ORDER)[number]);
}
export const WHEEL_STEP = STEP;
