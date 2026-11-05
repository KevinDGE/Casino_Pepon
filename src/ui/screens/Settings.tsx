import { useState } from 'react';
import { Page } from '../components/Layout';
import { Segmented, Toggle, Field } from '../components/Controls';
import { ConfirmDialog } from '../components/Modal';
import { useProfile } from '../store';
import { play } from '../../audio/sound';
import { fmtChips } from '../../coach/format';
import { STARTING_CHIPS, emptyBJStats, emptyPokerStats, emptyRouletteStats } from '../../persistence/schema';
import { saveSession } from '../../persistence/storage';

export function Settings() {
  const { profile, updateSettings, resetChips, resetEverything, update, storageOk } = useProfile();
  const s = profile.settings;
  const [ask, setAsk] = useState<null | 'chips' | 'stats' | 'all'>(null);
  return (
    <Page current="settings" title="Ajustes">
      {!storageOk ? <div className="notice">No se puede guardar en este navegador (modo privado o almacenamiento bloqueado). Tu progreso durará sólo esta sesión.</div> : null}
      <section className="panel">
        <h2 className="panel-title">Sonido y movimiento</h2>
        <Toggle label="Sonido" hint="Efectos sintetizados, sin música" checked={s.sound} onChange={(v) => { updateSettings({ sound: v }); if (v) window.setTimeout(() => play('win'), 60); }} />
        <Field label={`Volumen: ${Math.round(s.volume * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={!s.sound} aria-label="Volumen" onChange={(e) => updateSettings({ volume: Number(e.target.value) })} onPointerUp={() => play('chip')} />
        </Field>
        <Field label="Animaciones" hint="“Sistema” respeta la preferencia de reducir movimiento de tu dispositivo.">
          <Segmented label="Animaciones" value={s.motion} onChange={(v) => updateSettings({ motion: v })} options={[{ value: 'system', label: 'Sistema' }, { value: 'full', label: 'Completas' }, { value: 'reduce', label: 'Reducidas' }]} />
        </Field>
        <Toggle label="Vibración" hint="En celulares compatibles" checked={s.haptics} onChange={(v) => updateSettings({ haptics: v })} />
      </section>
      <section className="panel">
        <h2 className="panel-title">Juego</h2>
        <Toggle label="Coach" hint="Recomendaciones antes de actuar y revisión de cada mano" checked={s.coach} onChange={(v) => updateSettings({ coach: v })} />
        <Field label="Ritmo de los rivales">
          <Segmented label="Ritmo" value={s.speed} onChange={(v) => updateSettings({ speed: v })} options={[{ value: 'calm', label: 'Tranquilo' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Rápido' }]} />
        </Field>
        <Toggle label="Repartir la siguiente mano automáticamente" hint="Desactivado: tú decides cuándo seguir" checked={s.autoNextHand} onChange={(v) => updateSettings({ autoNextHand: v })} />
        <Toggle label="Baraja de cuatro colores" hint="♦ azul y ♣ verde para distinguir palos más fácil" checked={s.fourColorDeck} onChange={(v) => updateSettings({ fourColorDeck: v })} />
        <Field label="Recordatorio de pausa">
          <Segmented label="Recordatorio de pausa" value={s.breakReminder} onChange={(v) => updateSettings({ breakReminder: v })} options={[{ value: 0, label: 'No' }, { value: 30, label: '30 min' }, { value: 60, label: '60 min' }, { value: 90, label: '90 min' }]} />
        </Field>
      </section>
      <section className="panel">
        <h2 className="panel-title">Fichas y datos</h2>
        <p className="muted">Las fichas son virtuales y no tienen valor real. Todo se guarda sólo en este dispositivo.</p>
        <div className="btn-row wrap">
          <button className="btn btn-gold" onClick={() => setAsk('chips')}>Reiniciar fichas gratis ({fmtChips(STARTING_CHIPS)})</button>
          <button className="btn btn-ghost" onClick={() => setAsk('stats')}>Borrar estadísticas</button>
          <button className="btn btn-danger" onClick={() => setAsk('all')}>Borrar todos los datos</button>
        </div>
        <p className="muted small">Reinicios de fichas realizados: {profile.resets}</p>
      </section>
      <section className="panel">
        <h2 className="panel-title">Atajos de teclado</h2>
        <ul className="kbd-list">
          <li><b>Póker:</b> <kbd>F</kbd> retirarse · <kbd>C</kbd> pasar/igualar · <kbd>R</kbd> subir · <kbd>A</kbd> all-in · <kbd>↑</kbd>/<kbd>↓</kbd> ajustar · <kbd>Enter</kbd> confirmar · <kbd>N</kbd> siguiente mano · <kbd>K</kbd> coach</li>
          <li><b>Blackjack:</b> <kbd>H</kbd> pedir · <kbd>S</kbd> plantarse · <kbd>D</kbd> doblar · <kbd>P</kbd> dividir · <kbd>Y</kbd>/<kbd>N</kbd> seguro · <kbd>Enter</kbd> repartir</li>
          <li><b>Ruleta:</b> <kbd>Espacio</kbd> girar · <kbd>Z</kbd> deshacer · <kbd>X</kbd> limpiar · <kbd>1</kbd>–<kbd>6</kbd> valor de ficha</li>
          <li><kbd>?</kbd> muestra el tutorial del juego actual</li>
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">Acerca de</h2>
        <p className="muted">Casino Pepón 1.0 · Funciona sin conexión después de la primera carga. Sin anuncios, sin cuentas, sin compras.</p>
      </section>
      <ConfirmDialog open={ask === 'chips'} title="Reiniciar fichas" message={<p>Tus fichas volverán a {fmtChips(STARTING_CHIPS)}.</p>} confirmText="Reiniciar" onCancel={() => setAsk(null)} onConfirm={() => { resetChips(); setAsk(null); }} />
      <ConfirmDialog open={ask === 'stats'} title="Borrar estadísticas" message={<p>Se borrarán estadísticas e historial. Tus fichas y ajustes se conservan.</p>} confirmText="Borrar" danger onCancel={() => setAsk(null)} onConfirm={() => {
        update((d) => {
          d.stats = { poker: emptyPokerStats(), blackjack: emptyBJStats(), roulette: emptyRouletteStats() };
          d.history = { poker: [], blackjack: [], roulette: [] };
        });
        setAsk(null);
      }} />
      <ConfirmDialog open={ask === 'all'} title="Borrar todos los datos" message={<p>Se borrarán fichas, estadísticas, historial, ajustes y mesas en curso de este dispositivo.</p>} confirmText="Borrar todo" danger onCancel={() => setAsk(null)} onConfirm={() => { saveSession('poker', null); resetEverything(); setAsk(null); }} />
    </Page>
  );
}
