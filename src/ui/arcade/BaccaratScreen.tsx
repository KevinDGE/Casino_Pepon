import { useRef, useState } from 'react';
import { GameShell, CoachBox, ResultBanner, usePendingSettle } from './Shell';
import { useWallet } from './useWallet';
import { PlayingCard } from '../components/PlayingCard';
import { ChipToken } from '../components/Chip';
import { useHotkeys } from '../hooks';
import { useReducedMotion } from '../store';
import { useAnnouncer } from '../announcer';
import { CryptoRng } from '../../core/rng';
import { BAC_HOUSE_EDGE, BAC_NAMES_ES, bacReturn, newBacShoe, playBaccarat, type BacBet, type BacRound } from '../../engine/baccarat/baccarat';
import { fmtChips, fmtPct } from '../../coach/format';
import { play } from '../../audio/sound';

const rng = new CryptoRng();
const CHIPS = [5, 25, 100, 500, 1000];
const SPOTS: { bet: BacBet; pays: string }[] = [
  { bet: 'playerPair', pays: '11:1' },
  { bet: 'player', pays: '1:1' },
  { bet: 'tie', pays: '8:1' },
  { bet: 'banker', pays: '0.95:1' },
  { bet: 'bankerPair', pays: '11:1' },
];

export function BaccaratScreen() {
  const w = useWallet('baccarat');
  const { announce } = useAnnouncer();
  const reduced = useReducedMotion();
  const shoe = useRef(newBacShoe(rng));
  const pending = usePendingSettle();
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<Partial<Record<BacBet, number>>>({});
  const [round, setRound] = useState<BacRound | null>(null);
  const [last, setLast] = useState<{ wagered: number; returned: number } | null>(null);
  const [road, setRoad] = useState<('player' | 'banker' | 'tie')[]>([]);
  const [shown, setShown] = useState(0);
  const total = Object.values(bets).reduce((a, b) => a + (b ?? 0), 0);
  const busy = round !== null && shown < round.player.length + round.banker.length;

  const add = (b: BacBet) => {
    if (busy) return;
    if (last) { setLast(null); setRound(null); }
    if (total + chip > w.chips) return;
    setBets({ ...bets, [b]: (bets[b] ?? 0) + chip });
    play('chip');
  };

  const deal = () => {
    if (busy || total <= 0 || !w.debit(total)) return;
    const r = playBaccarat(shoe.current, rng);
    setRound(r);
    setShown(0);
    const n = r.player.length + r.banker.length;
    const step = reduced ? 30 : 420;
    for (let i = 1; i <= n; i++) window.setTimeout(() => { setShown(i); play('card'); }, i * step);
    const betsNow = bets;
    pending.set(() => {
      const ret = (Object.entries(betsNow) as [BacBet, number][]).reduce((a, [b, amt]) => a + bacReturn(b, amt, r), 0);
      w.settle(total, ret, `${r.winner === 'tie' ? 'Empate' : `Gana ${BAC_NAMES_ES[r.winner]}`} ${r.playerTotal}–${r.bankerTotal}`);
      setLast({ wagered: total, returned: ret });
      setRoad((x) => [...x.slice(-59), r.winner]);
      setBets({});
      play(ret > total ? 'win' : 'lose');
      announce(`Punto ${r.playerTotal}, Banca ${r.bankerTotal}. ${r.winner === 'tie' ? 'Empate' : `Gana ${BAC_NAMES_ES[r.winner]}`}.`);
    });
    window.setTimeout(pending.run, (n + 1) * step);
  };

  useHotkeys({ Enter: deal, ' ': deal, p: () => add('player'), b: () => add('banker'), e: () => add('tie') });

  // Orden de reparto: P1, B1, P2, B2, P3?, B3?
  const order: ('p' | 'b')[] = round ? ['p', 'b', 'p', 'b', ...(round.player.length > 2 ? ['p' as const] : []), ...(round.banker.length > 2 ? ['b' as const] : [])] : [];
  const visible = (side: 'p' | 'b') => {
    let count = 0;
    for (let i = 0; i < shown; i++) if (order[i] === side) count++;
    return count;
  };
  const cards = (side: 'p' | 'b') => (round ? (side === 'p' ? round.player : round.banker).slice(0, visible(side)) : []);
  const totalOf = (cs: number[]) => cs.reduce((a, c) => a + ((c >> 2) === 12 ? 1 : (c >> 2) >= 8 ? 0 : (c >> 2) + 2), 0) % 10;
  const pc = cards('p'), bc = cards('b');
  const done = !!last;
  const counts = { player: road.filter((x) => x === 'player').length, banker: road.filter((x) => x === 'banker').length, tie: road.filter((x) => x === 'tie').length };

  return (
    <GameShell
      game="baccarat"
      title="Baccarat"
      dock={
        <>
          <CoachBox
            headline={<>Menor ventaja de la casa: <b>Banca (1.06%)</b>. Evita el Empate (14.36%).</>}
            nums={total ? [{ label: 'Apostado', value: fmtChips(total) }, { label: 'Pérdida esperada', value: (Object.entries(bets) as [BacBet, number][]).reduce((a, [b, amt]) => a + amt * BAC_HOUSE_EDGE[b], 0).toFixed(1) }] : []}
            lines={[
              'En baccarat no tomas decisiones durante la mano: todo depende de a qué le apuestas.',
              'Banca gana un poco más seguido que Punto (45.9% contra 44.6%, el resto son empates); por eso cobra 5% de comisión y aun así es la mejor apuesta.',
              'El camino de resultados es sólo historial. Seguir rachas o “patrones” no cambia ninguna probabilidad.',
            ]}
          />
          {done && last ? <ResultBanner wagered={last.wagered} returned={last.returned} /> : null}
          <div className="chip-row" role="radiogroup" aria-label="Valor de ficha">
            {CHIPS.map((v) => (
              <button key={v} role="radio" aria-checked={chip === v} className={`chip-pick ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)} aria-label={`Ficha de ${v}`}>
                <ChipToken value={v} size={40} />
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setBets({})} disabled={busy || total === 0}>Limpiar</button>
            <button className="btn btn-gold btn-lg" onClick={deal} disabled={busy || total === 0 || total > w.chips}>Repartir {total ? fmtChips(total) : ''} <kbd>↵</kbd></button>
          </div>
        </>
      }
    >
      <section className="bac-table">
        <div className="bac-hands">
          {(['p', 'b'] as const).map((side) => {
            const cs = side === 'p' ? pc : bc;
            const win = done && round && ((side === 'p' && round.winner === 'player') || (side === 'b' && round.winner === 'banker'));
            return (
              <div key={side} className={`bac-hand bac-${side} ${win ? 'win' : ''}`}>
                <div className="bac-hand-head">
                  <span className="bac-label">{side === 'p' ? 'PUNTO' : 'BANCA'}</span>
                  <span className="bac-total" aria-label={`Total ${side === 'p' ? 'Punto' : 'Banca'}`}>{cs.length ? totalOf(cs) : '–'}</span>
                </div>
                <div className="bac-cards">
                  {cs.map((c, i) => <PlayingCard key={`${i}-${c}`} card={c} size="md" className={i === 2 ? 'bac-third' : ''} animate={!reduced} />)}
                </div>
              </div>
            );
          })}
        </div>
        {done && round ? <div className="bac-verdict pop-in">{round.winner === 'tie' ? 'Empate' : `Gana ${BAC_NAMES_ES[round.winner]}`}{round.natural ? ' · natural' : ''}</div> : null}
        <div className="bac-spots" role="group" aria-label="Apuestas">
          {SPOTS.map((s) => (
            <button key={s.bet} className={`bac-spot spot-${s.bet}`} onClick={() => add(s.bet)} disabled={busy} aria-label={`${BAC_NAMES_ES[s.bet]}, paga ${s.pays}, ventaja de la casa ${fmtPct(BAC_HOUSE_EDGE[s.bet], 2)}${bets[s.bet] ? `, apuesta ${bets[s.bet]}` : ''}`}>
              <b>{BAC_NAMES_ES[s.bet]}</b>
              <small>{s.pays} · casa {fmtPct(BAC_HOUSE_EDGE[s.bet], 2)}</small>
              {bets[s.bet] ? <span className="spot-chip"><ChipToken value={bets[s.bet]!} size={30} /></span> : null}
            </button>
          ))}
        </div>
        <div className="bac-road" aria-label={`Últimos resultados: Punto ${counts.player}, Banca ${counts.banker}, Empate ${counts.tie}`}>
          <div className="bac-road-grid">
            {road.map((r, i) => <span key={i} className={`road-dot road-${r}`}>{r === 'player' ? 'P' : r === 'banker' ? 'B' : 'E'}</span>)}
          </div>
          <small className="muted">P {counts.player} · B {counts.banker} · E {counts.tie} — el historial no predice la siguiente mano</small>
        </div>
      </section>
    </GameShell>
  );
}
