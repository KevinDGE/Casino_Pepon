import { useEffect, useRef, useState } from 'react';
import type { PokerState } from '../../engine/poker/types';
import { positionName } from '../../engine/poker/game';
import { bestFive } from '../../engine/poker/handEval';
import { PlayingCard, CardSlot } from '../components/PlayingCard';
import { BetStack } from '../components/Chip';
import { fmtChips } from '../../coach/format';
import { rivalById } from '../../ai/poker/profiles';
import type { SeatMeta } from './usePokerTable';
import { useReducedMotion } from '../store';
import { play } from '../../audio/sound';

const PORTRAIT: [number, number][][] = [
  [],
  [[50, 9]],
  [[18, 26], [82, 26]],
  [[17, 30], [50, 8], [83, 30]],
  [[17, 62], [22, 17], [78, 17], [83, 62]],
  [[17, 64], [18, 30], [50, 8], [82, 30], [83, 64]],
];
const LANDSCAPE: [number, number][][] = [
  [],
  [[50, 11]],
  [[26, 14], [74, 14]],
  [[11, 46], [50, 10], [89, 46]],
  [[10, 56], [30, 11], [70, 11], [90, 56]],
  [[9, 60], [20, 15], [50, 9], [80, 15], [91, 60]],
];
const CENTER: [number, number] = [50, 46];

function lastActionLabel(state: PokerState, seat: number): string | null {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i]!;
    if (e.t === 'street') return null;
    if (e.t === 'action' && e.seat === seat) {
      switch (e.kind) {
        case 'fold': return 'Se retira';
        case 'check': return 'Pasa';
        case 'call': return 'Iguala';
        case 'bet': return 'Apuesta';
        case 'raise': return 'Sube';
        case 'allin': return 'All-in';
      }
    }
  }
  return null;
}

export function PokerTableView({ state, seats, thinking, landscape, onBoardRevealed }: {
  state: PokerState;
  seats: SeatMeta[];
  thinking: number | null;
  landscape: boolean;
  onBoardRevealed: (done: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const n = state.players.length;
  const layout = (landscape ? LANDSCAPE : PORTRAIT)[n - 1] ?? [];
  const pos = (seat: number): [number, number] => (seat === 0 ? [50, landscape ? 84 : 86] : layout[seat - 1] ?? [50, 10]);

  // Revelado progresivo del tablero cuando salen varias cartas a la vez (all-in).
  const [shown, setShown] = useState(state.board.length);
  const handRef = useRef(state.handNumber);
  useEffect(() => {
    const len = state.board.length;
    if (handRef.current !== state.handNumber) {
      handRef.current = state.handNumber;
      setShown(len);
      onBoardRevealed(true);
      return;
    }
    if (len <= shown) {
      if (len < shown) setShown(len);
      onBoardRevealed(true);
      return;
    }
    const normalStep = (shown === 0 && len === 3) || len - shown === 1;
    if (normalStep) {
      setShown(len);
      onBoardRevealed(true);
      return;
    }
    onBoardRevealed(false);
    const t = window.setTimeout(() => {
      setShown(shown === 0 ? 3 : shown + 1);
      play('card');
    }, reduced ? 80 : 700);
    return () => window.clearTimeout(t);
  }, [state.board.length, state.handNumber, shown, reduced, onBoardRevealed]);

  const board = state.board.slice(0, shown);
  const allShown = shown >= state.board.length;
  const result = allShown ? state.result : null;
  const winners = new Set(result ? result.pots.flatMap((p) => p.winners) : []);
  const best = new Set<number>();
  if (result?.showdown) {
    for (const w of winners) for (const c of bestFive([...state.players[w]!.hole, ...state.board])) best.add(c);
  }
  const pot = state.players.reduce((a, p) => a + p.contributed, 0);
  const potCollected = state.players.reduce((a, p) => a + p.contributed - p.bet, 0);

  return (
    <div className={`ptable ${landscape ? 'ptable-wide' : 'ptable-tall'}`}>
      <div className="felt" aria-hidden="true">
        <div className="felt-inner">
          <span className="felt-logo">Casino Pepón</span>
        </div>
      </div>
      <div className="board-area" style={{ left: `${CENTER[0]}%`, top: `${CENTER[1]}%` }}>
        <div className="pot" aria-live="off">
          {state.phase === 'idle' ? <span className="pot-label">Lista para repartir</span> : (
            <>
              <span className="pot-label">Bote</span>
              <span key={potCollected} className="pot-amount bump">{fmtChips(result ? pot : potCollected || pot)}</span>
            </>
          )}
        </div>
        <div className="board" role="group" aria-label={`Cartas comunitarias: ${board.length ? '' : 'ninguna'}`}>
          {[0, 1, 2, 3, 4].map((i) =>
            board[i] !== undefined ? (
              <PlayingCard key={`${state.handNumber}-${i}`} card={board[i]!} size="md" highlight={best.has(board[i]!)} dim={!!result?.showdown && !best.has(board[i]!)} animate={!reduced} />
            ) : (
              <CardSlot key={i} size="md" />
            ),
          )}
        </div>
        {result && result.pots.length > 1 ? (
          <div className="side-pots">
            {result.pots.map((p, i) => (
              <span key={i}>{i === 0 ? 'Principal' : `Secundario ${i}`}: {fmtChips(p.amount)}</span>
            ))}
          </div>
        ) : null}
      </div>
      {state.players.map((p) => {
        const [x, y] = pos(p.seat);
        const meta = seats[p.seat]!;
        const profile = meta.profileId ? rivalById(meta.profileId) : null;
        const isTurn = state.toAct === p.seat && state.phase === 'betting';
        const revealed = p.isHuman || (allShown && state.revealed.includes(p.seat));
        const label = lastActionLabel(state, p.seat);
        const side = !p.isHuman && Math.abs(x - 50) > 20;
        const fx = p.isHuman ? 0 : landscape ? 0.36 : side ? 0.42 : 0.4;
        const fy = p.isHuman ? (landscape ? 0.62 : 0.44) : landscape ? 0.38 : side ? 0.55 : 0.36;
        const bx = x + (CENTER[0] - x) * fx;
        const by = y + (CENTER[1] - y) * fy;
        const won = result?.net[p.seat] ?? 0;
        const posName = state.phase !== 'idle' && !p.out ? positionName(state, p.seat) : '';
        return (
          <div key={p.seat}>
            <div
              className={`seat ${p.isHuman ? 'seat-human' : ''} ${isTurn ? 'seat-turn' : ''} ${p.folded && !p.out ? 'seat-folded' : ''} ${p.out ? 'seat-out' : ''} ${winners.has(p.seat) ? 'seat-win' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`${p.isHuman ? 'Tú' : p.name}${meta.level ? `, ${meta.level === 'expert' ? 'experto' : meta.level === 'advanced' ? 'avanzado' : meta.level === 'intermediate' ? 'intermedio' : 'principiante'}` : ''}, ${fmtChips(p.stack)} fichas${p.folded ? ', retirado' : ''}${isTurn ? ', en turno' : ''}`}
            >
              <div className={`seat-cards ${p.isHuman ? 'seat-cards-human' : ''}`}>
                {p.out || state.phase === 'idle'
                  ? null
                  : p.hole.map((c, i) =>
                      revealed ? (
                        <PlayingCard
                          key={`${state.handNumber}-${i}-f`}
                          card={c}
                          size={p.isHuman ? 'md' : 'sm'}
                          highlight={best.has(c)}
                          dim={p.isHuman && p.folded}
                          delay={p.isHuman ? i * 120 : 0}
                          className={p.isHuman ? '' : 'flip-in'}
                          animate={!reduced}
                        />
                      ) : !p.folded ? (
                        <PlayingCard key={`${state.handNumber}-${i}`} card={null} size="xs" delay={i * 90 + p.seat * 40} animate={!reduced} />
                      ) : null,
                    )}
              </div>
              <div className="seat-plate">
                <span
                  className="avatar"
                  style={{ background: profile ? `linear-gradient(135deg, ${profile.colors[0]}, ${profile.colors[1]})` : undefined }}
                  aria-hidden="true"
                >
                  {p.isHuman ? 'TÚ' : profile?.initials ?? p.name.slice(0, 2)}
                  {thinking === p.seat ? <span className="thinking-dots"><i /><i /><i /></span> : null}
                </span>
                <span className="seat-info">
                  <span className="seat-name">{p.isHuman ? 'Tú' : p.name}</span>
                  <span className="seat-stack">{p.out ? 'Eliminado' : fmtChips(p.stack)}</span>
                </span>
                {posName ? <span className={`pos-badge ${posName.startsWith('BTN') ? 'pos-btn' : ''}`}>{posName === 'BTN' ? 'D' : posName}</span> : null}
              </div>
              {label && !result ? <span className={`action-bubble act-${label === 'Se retira' ? 'fold' : label === 'All-in' ? 'allin' : 'neutral'}`}>{label}</span> : null}
              {result && won !== 0 ? <span className={`delta ${won > 0 ? 'delta-up' : 'delta-down'}`}>{won > 0 ? '+' : '−'}{fmtChips(Math.abs(won))}</span> : null}
            </div>
            {p.bet > 0 && !result ? (
              <div className="seat-bet" style={{ left: `${bx}%`, top: `${by}%` }}>
                <BetStack amount={p.bet} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
