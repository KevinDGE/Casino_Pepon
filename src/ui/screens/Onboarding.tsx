import { useState } from 'react';
import { LogoMark } from '../components/Logo';
import { Toggle } from '../components/Controls';
import { useProfile } from '../store';
import { play } from '../../audio/sound';

const STEPS = [
  {
    title: 'Bienvenido a Casino Pepón',
    body: [
      'Un casino para aprender y divertirte con fichas virtuales.',
      'Las fichas no tienen valor real: no hay dinero, compras, depósitos, retiros ni premios. Nunca.',
    ],
  },
  {
    title: 'Rivales con inteligencia artificial',
    body: [
      'Juega Texas Hold’em contra 1 a 5 rivales con niveles de Principiante a Experto, cada uno con su propio estilo.',
      'La IA juega limpio: nunca ve tus cartas ni el mazo. Sólo usa lo que cualquier jugador vería en la mesa.',
    ],
  },
  {
    title: 'Un coach a tu lado',
    body: [
      'El coach te recomienda una jugada antes de actuar y te explica por qué, con números como equity, pot odds y valor esperado.',
      'Al terminar cada mano te muestra aciertos, errores y alternativas.',
    ],
  },
  {
    title: 'Juega a tu ritmo',
    body: [
      'Puedes reiniciar tus fichas gratis cuando quieras desde Ajustes o desde el inicio.',
      'Si te sirve, activa un recordatorio de pausa. Aquí no hay prisas ni bonos por seguir jugando.',
    ],
  },
];

export function Onboarding() {
  const { profile, update, updateSettings } = useProfile();
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const finish = () => update((d) => { d.onboardingDone = true; });
  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-card">
        <div className="ob-logo"><LogoMark size={76} /></div>
        <div className="ob-dots" aria-hidden="true">
          {STEPS.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}
        </div>
        <h1 id="ob-title" className="ob-title">{step.title}</h1>
        {step.body.map((p) => <p key={p} className="ob-text">{p}</p>)}
        {last ? (
          <div className="ob-settings">
            <Toggle label="Sonido" hint="Efectos suaves, sin música" checked={profile.settings.sound} onChange={(v) => { updateSettings({ sound: v }); if (v) window.setTimeout(() => play('chip'), 50); }} />
            <Toggle label="Coach activado" hint="Puedes cambiarlo en cualquier momento" checked={profile.settings.coach} onChange={(v) => updateSettings({ coach: v })} />
          </div>
        ) : null}
        <div className="ob-actions">
          {i > 0 ? <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Atrás</button> : <button className="btn btn-ghost" onClick={finish}>Saltar</button>}
          {last ? (
            <button className="btn btn-gold btn-lg" onClick={finish} autoFocus>Empezar</button>
          ) : (
            <button className="btn btn-gold btn-lg" onClick={() => setI(i + 1)} autoFocus>Siguiente</button>
          )}
        </div>
        <p className="ob-legal">Sólo entretenimiento y aprendizaje. Fichas virtuales sin valor monetario.</p>
      </div>
    </div>
  );
}
