import { useState } from 'react';
import { GameShell, CoachBox, ResultBanner, BetPicker } from './Shell';
import { useWallet } from './useWallet';
import { PlayingCard } from '../components/PlayingCard';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng } from '../../core/rng';
import { cardAriaLabel } from '../../core/cards';
import { HILO_EDGE, hiloMultiplier, hiloOdds, hiloPlay, newHiLo, type HiLoGuess } from '../../engine/hilo/hilo';
import { fmtChips, fmtPct } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();
const NAME: Record<HiLoGuess, string> = { higher: 'Mayor', lower: 'Menor', equal: 'Igual' };

export function HiLoScreen() {
  const w = useWallet('mayormenor');
  const { announce, toast } = useAnnouncer();
  const reduced = useReducedMotion();
  const [st, setSt] = useState(() => newHiLo(rng));
  const [bet, setBet] = useState(25);
  const [prev, setPrev] = useState<number[]>([]);
  const [last, setLast] = useState<{ wagered: number; returned: number; guess: HiLoGuess } | null>(null);
  const odds = hiloOdds(st);
  const remaining = st.deck.length - st.pos;

  const guess = (g: HiLoGuess) => {
    if (odds[g] <= 0 || bet <= 0 || !w.debit(bet)) return;
    const r = hiloPlay(st, g, rng);
    const ret = r.won ? Math.floor(bet * r.multiplier) : 0;
    w.settle(bet, ret, `${NAME[g]} (×${r.multiplier.toFixed(2)}) → ${r.won ? 'acierto' : 'fallo'}`);
    setPrev((p) => [st.current, ...p].slice(0, 12));
    setSt(r.state);
    setLast({ wagered: bet, returned: ret, guess: g });
    if (r.reshuffled) toast('Se barajó un mazo nuevo.');
    play(r.won ? 'win' : 'lose');
    announce(`Salió ${cardAriaLabel(r.next)}. ${r.won ? `Aciertas, cobras ${fmtChips(ret)}` : 'Fallaste'}.`);
  };

  useHotkeys({ ArrowUp: () => guess('higher'), ArrowDown: () => guess('lower'), '=': () => guess('equal'), m: () => guess('higher'), n: () => guess('lower') });

  const opt = (g: HiLoGuess) => ({ p: odds[g], m: hiloMultiplier(odds[g]) });
  return (
    <GameShell
      game="mayormenor"
      title="Mayor o Menor"
      dock={
        <>
          <CoachBox
            headline={<>Más probable: <b>{odds.higher >= odds.lower ? 'Mayor' : 'Menor'}</b> ({fmtPct(Math.max(odds.higher, odds.lower), 1)}) — todas las opciones tienen el mismo EV ≈ −{fmtPct(HILO_EDGE)}</>}
            lines={[
              `Quedan ${remaining} cartas en el mazo. Las probabilidades se calculan con ellas: las cartas que ya salieron no pueden volver hasta barajar.`,
              'El pago se ajusta a la probabilidad: lo seguro paga poco y lo arriesgado paga mucho. Por eso ninguna elección es mejor que otra a largo plazo.',
              'Si sale una carta igual, “Mayor” y “Menor” pierden.',
            ]}
          />
          {last ? <ResultBanner wagered={last.wagered} returned={last.returned} text={`Elegiste ${NAME[last.guess]}`} /> : null}
          <BetPicker value={bet} onChange={setBet} max={Math.min(w.chips, 2000)} />
          <div className="action-buttons hilo-actions">
            {(['lower', 'equal', 'higher'] as HiLoGuess[]).map((g) => {
              const o = opt(g);
              return (
                <button key={g} className={`act-btn ${g === 'higher' ? 'act-call' : g === 'lower' ? 'act-fold' : 'act-check'}`} onClick={() => guess(g)} disabled={o.p <= 0 || bet <= 0 || bet > w.chips}
                  aria-label={`${NAME[g]}: probabilidad ${fmtPct(o.p, 1)}, paga ${o.m.toFixed(2)} veces`}>
                  <span className="hilo-btn"><b>{g === 'higher' ? '▲ ' : g === 'lower' ? '▼ ' : '= '}{NAME[g]}</b><small>{fmtPct(o.p, 1)} · ×{o.m.toFixed(2)}</small></span>
                </button>
              );
            })}
          </div>
        </>
      }
    >
      <section className="hilo-stage">
        <div className="hilo-current">
          <PlayingCard key={st.current + '-' + st.pos} card={st.current} size="lg" animate={!reduced} className="hilo-card" />
          <span className="muted small">Quedan {remaining} cartas</span>
        </div>
        <div className="hilo-prev" aria-label="Cartas anteriores">
          {prev.map((c, i) => <PlayingCard key={`${i}-${c}`} card={c} size="xs" animate={false} />)}
        </div>
      </section>
    </GameShell>
  );
}
