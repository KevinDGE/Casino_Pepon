import { useCallback } from 'react';
import { useProfile, uid } from '../store';
import { emptyArcadeStats } from '../../persistence/schema';
import { addResult } from '../../ranking/periods';

/**
 * Billetera común para los juegos adicionales: descuenta la apuesta al jugar
 * y registra el resultado (estadísticas + historial) al liquidar.
 */
export function useWallet(game: string) {
  const { profile, update } = useProfile();
  const debit = useCallback(
    (amount: number): boolean => {
      if (amount <= 0 || amount > profile.chips) return false;
      update((d) => { d.chips -= Math.floor(amount); });
      return true;
    },
    [profile.chips, update],
  );
  /** Acredita lo devuelto y registra la ronda. `wagered` = total apostado en la ronda. */
  const settle = useCallback(
    (wagered: number, returned: number, summary: string, coach?: { good: boolean; evLoss: number }, extraDebit = 0) => {
      const ret = Math.floor(returned);
      const net = ret - wagered;
      update((d) => {
        d.chips += ret - extraDebit;
        d.ranking = addResult(d.ranking, net);
        const st = (d.stats.arcade[game] ??= emptyArcadeStats());
        st.rounds++;
        st.wagered += wagered;
        st.returned += ret;
        st.net += net;
        st.biggestWin = Math.max(st.biggestWin, net);
        if (coach) {
          st.decisions++;
          if (coach.good) st.good++;
          st.evLoss += coach.evLoss;
        }
        d.history.arcade.unshift({ id: uid(), ts: Date.now(), game, summary, wagered, net });
      });
      return net;
    },
    [game, update],
  );
  return { chips: profile.chips, debit, settle, settings: profile.settings, stats: profile.stats.arcade[game] ?? emptyArcadeStats() };
}
