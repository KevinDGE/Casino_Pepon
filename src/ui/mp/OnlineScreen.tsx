import { useCallback, useMemo, useState } from 'react';
import { Page, TopBar } from '../components/Layout';
import { Field, Segmented } from '../components/Controls';
import { ConfirmDialog } from '../components/Modal';
import { Icon } from '../components/Icon';
import { useProfile } from '../store';
import { useLandscape } from '../hooks';
import { useOnline } from './useOnline';
import { rotateForView } from './rotate';
import { useBackend } from '../ranking/useRanking';
import { AliasEditor } from '../ranking/AliasEditor';
import { PokerTableView } from '../poker/PokerTableView';
import { ActionBar } from '../poker/ActionBar';
import type { SeatMeta } from '../poker/usePokerTable';
import { getLegalActions } from '../../engine/poker/game';
import { fmtChips, fmtSignedChips } from '../../coach/format';
import type { Pending } from '../../mp/protocol';

const STREET_ES = { preflop: 'preflop', flop: 'el flop', turn: 'el turn', river: 'el river' } as const;

function pendingText(p: Pending, names: Record<string, string>, me: string | null): string {
  const n = (u: string) => (u === me ? 'tú' : names[u] || 'otro jugador');
  switch (p.kind) {
    case 'waitLineup': return 'Esperando a que empiece la mano…';
    case 'shuffle': return `Barajando el mazo cifrado: turno de ${n(p.who)}…`;
    case 'hole': return `Repartiendo cartas cifradas: turno de ${n(p.who)}…`;
    case 'act': return p.who === me ? 'Es tu turno' : `Turno de ${n(p.who)}…`;
    case 'reveal': return `Descifrando ${STREET_ES[p.street]}: turno de ${n(p.who)}…`;
    case 'showdown': return `Mostrando cartas: ${p.who.map(n).join(', ')}…`;
    case 'done': return 'Mano terminada. La siguiente empieza en unos segundos…';
    case 'void': return 'Mano anulada (alguien se desconectó). Nadie pierde fichas.';
    case 'error': return `Se detectó un problema${p.who ? ` con ${n(p.who)}` : ''}: ${p.message}. La mano se anulará.`;
  }
}

function Lobby({ o }: { o: ReturnType<typeof useOnline> }) {
  const { profile } = useProfile();
  const [name, setName] = useState('Mesa de los Pepones');
  const [bb, setBb] = useState(20);
  const [buyInBB, setBuyInBB] = useState(100);
  const [maxSeats, setMaxSeats] = useState(6);
  const now = Date.now();
  const tables = useMemo(() => {
    const byTable = new Map<string, number[]>();
    for (const d of Object.values(o.lobby)) if (d.table && now - (d.alive || 0) < 90_000) byTable.set(d.table, [...(byTable.get(d.table) ?? []), d.seat]);
    return Object.entries(o.lobby)
      .filter(([, d]) => d.hostOpen && d.host && d.table === d.host.tableId && now - (d.alive || 0) < 90_000)
      .map(([hostId, d]) => ({ hostId, host: d.host!, seats: byTable.get(d.table!) ?? [], playing: !!d.lineup }))
      .sort((a, b) => b.host.createdAt - a.host.createdAt);
  }, [o.lobby, now]);
  const buyIn = bb * buyInBB;
  return (
    <>
      <section className="panel">
        <h2 className="panel-title">Mesas abiertas</h2>
        {tables.length ? (
          <ul className="online-tables">
            {tables.map((t) => {
              const full = t.seats.length >= t.host.maxSeats;
              return (
                <li key={t.host.tableId} className="online-table">
                  <div>
                    <b>{t.host.name}</b>
                    <small>Hospeda {o.names[t.hostId] || 'Jugador'} · ciegas {fmtChips(t.host.sb)}/{fmtChips(t.host.bb)} · entrada {fmtChips(t.host.buyIn)}</small>
                  </div>
                  <span className="online-seats">{t.seats.length}/{t.host.maxSeats}</span>
                  <button className="btn btn-gold" disabled={full || profile.chips < t.host.buyIn} onClick={() => o.join(t.hostId, t.host, t.seats)}>
                    {full ? 'Llena' : 'Sentarme'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">No hay mesas abiertas ahora. Crea una e invita a tus amigos a abrir este casino.</p>}
      </section>
      <section className="panel">
        <h2 className="panel-title">Crear mesa</h2>
        <Field label="Nombre de la mesa">
          <input id="online-table-name" className="text-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Ciegas">
          <Segmented label="Ciegas" value={bb} onChange={setBb} options={[10, 20, 50, 100].map((x) => ({ value: x, label: `${x / 2}/${x}` }))} />
        </Field>
        <Field label={`Entrada: ${fmtChips(buyIn)} fichas`}>
          <Segmented label="Entrada" value={buyInBB} onChange={setBuyInBB} options={[50, 100, 200].map((x) => ({ value: x, label: `${x} BB` }))} />
        </Field>
        <Field label="Asientos">
          <Segmented label="Asientos" value={maxSeats} onChange={setMaxSeats} options={[2, 3, 4, 5, 6].map((x) => ({ value: x, label: String(x) }))} />
        </Field>
        <div className="btn-row">
          <button className="btn btn-gold btn-lg" disabled={profile.chips < buyIn || !name.trim()} onClick={() => o.createTable({ name: name.trim().slice(0, 40), sb: bb / 2, bb, buyIn, maxSeats })}>Crear y sentarme</button>
        </div>
        {profile.chips < buyIn ? <p className="muted small">No te alcanzan las fichas para esa entrada. Puedes reiniciarlas gratis en Ajustes.</p> : null}
      </section>
      <section className="panel">
        <h2 className="panel-title">Cómo funciona el juego en línea</h2>
        <ul className="plain-list">
          <li>Juegas Texas Hold’em en tiempo real contra otras personas que abren este casino. Las fichas siguen siendo virtuales.</li>
          <li><b>Nadie ve tus cartas, ni quien hospeda la mesa.</b> Usamos “póker mental”: cada jugador cifra y baraja el mazo con su propia clave secreta, y cada carta se descifra sólo para quien debe verla. Las cartas de quienes se retiran nunca se revelan.</li>
          <li>Si alguien publica una carta manipulada o repetida, la mesa lo detecta y anula la mano. Si alguien se desconecta, se retira de su turno o la mano se anula sin que nadie pierda fichas.</li>
          <li>Repartir es un poco más lento que contra la IA: cada carta pasa por todos los jugadores. El coach se desactiva en estas mesas para que el juego sea justo entre personas.</li>
          <li>Tus resultados cuentan para el ranking.</li>
        </ul>
      </section>
    </>
  );
}

export function OnlineScreen() {
  const o = useOnline();
  const be = useBackend();
  const firebase = be?.kind === 'firebase';
  const landscape = useLandscape();
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const onBoard = useCallback(() => undefined, []);

  if (o.available !== 'yes' || !o.session) {
    return (
      <Page current="online" title="Póker en línea">
        {o.available === 'loading' ? <p className="empty" role="status">Conectando…</p> : null}
        {o.available === 'no' ? (
          <div className="notice">El juego en línea funciona en la versión publicada del casino en claude.ai, donde los jugadores comparten mesa. Aquí puedes jugar contra la IA en Texas Hold’em.</div>
        ) : null}
        {o.available === 'signedout' ? (
          <div className="notice">{firebase ? 'No se pudo iniciar tu sesión anónima para jugar en línea. Revisa tu conexión y vuelve a abrir la página.' : 'Inicia sesión en claude.ai para jugar en línea.'}</div>
        ) : null}
        {be && firebase && o.available === 'yes' ? <AliasEditor be={be} /> : null}
        {o.error === 'readonly' ? <div className="notice">Tu acceso a este casino es de sólo lectura. Para jugar en línea, pide a quien lo compartió acceso de colaborador.</div> : null}
        {o.available === 'yes' ? <Lobby o={o} /> : null}
      </Page>
    );
  }

  const r = o.replay;
  const me = o.me!;
  const hostInfo = o.hostDoc?.host ?? null;
  const p = r?.pending ?? { kind: 'waitLineup' as const };
  const myTurn = p.kind === 'act' && p.who === me && !!r?.state;
  const legal = myTurn && r?.state && r.mySeat >= 0 ? getLegalActions(r.state, r.mySeat) : null;
  const view = r?.state ? rotateForView(r.state, r.mySeat, o.names, r.myHole) : null;
  const seatsMeta: SeatMeta[] = view ? view.players.map((pl) => ({ id: pl.id, name: pl.name, isHuman: pl.isHuman })) : [];
  const waitingPlayers = o.seated.length;
  const myStackNow = r?.state && r.mySeat >= 0 ? r.state.players[r.mySeat]!.stack : o.session.stack;

  return (
    <div className="game-page poker-page">
      <TopBar
        title={hostInfo ? `${hostInfo.name} · ${fmtChips(hostInfo.sb)}/${fmtChips(hostInfo.bb)}` : 'Póker en línea'}
        back
        right={<button className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(true)}>Salir</button>}
      />
      <div className="table-wrap-area">
        {view ? (
          <PokerTableView state={view} seats={seatsMeta} thinking={null} landscape={landscape} onBoardRevealed={onBoard} />
        ) : (
          <div className="online-wait">
            <Icon name="cards" size={40} />
            <b>{hostInfo?.name ?? 'Mesa'}</b>
            <span>{waitingPlayers} {waitingPlayers === 1 ? 'persona sentada' : 'personas sentadas'}: {o.seated.map((s) => o.names[s.uid] || 'Jugador').join(', ')}</span>
            <span className="muted small">Comparte este casino para que más personas se sienten. Se necesitan al menos 2.</span>
          </div>
        )}
      </div>
      <div className="dock">
        <div className="online-status" role="status" aria-live="polite">
          <span className={`online-dot ${myTurn ? 'turn' : ''}`} />
          {o.tableClosed ? 'Quien hospedaba cerró la mesa.' : pendingText(p, o.names, me)}
          <small className="muted">Tus fichas en la mesa: {fmtChips(myStackNow)}</small>
        </div>
        {myTurn && legal && r?.state ? (
          <ActionBar
            legal={legal}
            pot={r.state.players.reduce((a, pl) => a + pl.contributed, 0)}
            currentBet={r.state.currentBet}
            myBet={r.state.players[r.mySeat]!.bet}
            bigBlind={r.state.bigBlind}
            disabled={false}
            onAct={o.act}
            raiseOpen={raiseOpen}
            setRaiseOpen={setRaiseOpen}
          />
        ) : null}
        {o.isHost && !o.lineup ? (
          <div className="btn-row">
            <button className="btn btn-gold btn-lg" disabled={waitingPlayers < 2} onClick={o.startFirstHand}>Repartir la primera mano</button>
          </div>
        ) : null}
        {r?.state?.result && p.kind === 'done' && r.mySeat >= 0 ? (
          <p className="center small">Resultado de la mano: <b className={(r.state.result.net[r.mySeat] ?? 0) > 0 ? 'good' : (r.state.result.net[r.mySeat] ?? 0) < 0 ? 'bad' : ''}>{fmtSignedChips(r.state.result.net[r.mySeat] ?? 0)}</b></p>
        ) : null}
        {o.tableClosed || (o.session.stack <= 0 && p.kind !== 'act') ? (
          <div className="btn-row"><button className="btn btn-gold" onClick={o.leave}>Salir de la mesa</button></div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmLeave}
        title="Salir de la mesa en línea"
        message={<p>{r && r.mySeat >= 0 && p.kind !== 'done' && p.kind !== 'void' ? 'Salir ahora cuenta como retirarte de la mano en curso. ' : ''}{o.isHost ? 'Como hospedas, la mesa se cerrará para todos. ' : ''}Tus fichas de la mesa vuelven a tu saldo.</p>}
        confirmText="Salir"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => { setConfirmLeave(false); o.leave(); }}
      />
    </div>
  );
}
