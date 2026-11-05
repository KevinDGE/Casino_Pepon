import { useState } from 'react';
import { Modal } from '../components/Modal';

export type GameId = 'poker' | 'blackjack' | 'roulette';

const CONTENT: Record<GameId, { title: string; steps: { h: string; p: string[] }[] }> = {
  poker: {
    title: 'Tutorial: Texas Hold’em',
    steps: [
      { h: 'El objetivo', p: ['Gana fichas formando la mejor mano de 5 cartas con tus 2 cartas y las 5 comunitarias, o haciendo que los demás se retiren.'] },
      { h: 'Las rondas', p: ['Preflop → Flop (3 cartas) → Turn (1) → River (1). En cada ronda puedes retirarte, pasar, igualar o subir.', 'La “D” marca al botón (repartidor). SB y BB ponen las ciegas obligatorias.'] },
      { h: 'Tus controles', p: ['Usa los botones grandes de abajo. Para subir, toca “Subir” y elige un tamaño con los atajos (½ bote, bote…) o el deslizador.', 'En teclado: F retirarse · C pasar/igualar · R subir · A all-in · ↑↓ ajustar · Enter confirmar · N siguiente mano · K coach.'] },
      { h: 'El coach', p: ['Antes de actuar verás una recomendación con tu equity (probabilidad de ganar) y lo que necesitas según las pot odds. Toca “¿Por qué?” para ver la explicación y el EV de cada opción.', 'Al terminar la mano, revisa tus aciertos y errores.'] },
    ],
  },
  blackjack: {
    title: 'Tutorial: Blackjack',
    steps: [
      { h: 'El objetivo', p: ['Acércate a 21 más que el crupier sin pasarte. Las figuras valen 10 y el As vale 1 u 11.'] },
      { h: 'Apostar y jugar', p: ['Toca las fichas para armar tu apuesta y luego “Repartir”.', 'Pedir (H) toma otra carta · Plantarse (S) · Doblar (D) duplica tu apuesta y recibes una sola carta · Dividir (P) separa un par en dos manos.'] },
      { h: 'El seguro', p: ['Si el crupier muestra un As, puedes asegurar con la mitad de tu apuesta: paga 2:1 si tiene blackjack. Casi nunca conviene; el coach te lo explica con números.'] },
      { h: 'Reglas y coach', p: ['En “Reglas” puedes cambiar mazos, si el crupier pide con 17 suave, el pago del blackjack y más. El coach calcula el valor esperado de cada acción con esas reglas.'] },
    ],
  },
  roulette: {
    title: 'Tutorial: Ruleta europea',
    steps: [
      { h: 'El paño', p: ['Elige el valor de ficha y toca el paño. Las apuestas exteriores (rojo, par, docenas…) se colocan directo.', 'Al tocar un número verás todas las apuestas interiores que lo incluyen: pleno, caballo, transversal, cuadro y seisena.'] },
      { h: 'Girar', p: ['Toca “Girar” (o Espacio). Puedes deshacer (Z), limpiar (X) o repetir tu última apuesta.'] },
      { h: 'Probabilidades', p: ['Cada apuesta muestra su probabilidad y su pago. Todas tienen el mismo valor esperado: −2.70% por ficha.', 'Ninguna estrategia elimina la ventaja de la casa y los giros anteriores no influyen en el siguiente.'] },
    ],
  },
};

export function Tutorial({ game, open, onClose }: { game: GameId; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const c = CONTENT[game];
  const step = c.steps[i]!;
  const last = i === c.steps.length - 1;
  const close = () => { setI(0); onClose(); };
  return (
    <Modal
      open={open}
      title={c.title}
      onClose={close}
      footer={
        <>
          <span className="muted small">{i + 1} / {c.steps.length}</span>
          {i > 0 ? <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Atrás</button> : null}
          <button className="btn btn-gold" onClick={() => (last ? close() : setI(i + 1))}>{last ? '¡A jugar!' : 'Siguiente'}</button>
        </>
      }
    >
      <h3 className="tut-h">{step.h}</h3>
      {step.p.map((p) => <p key={p}>{p}</p>)}
    </Modal>
  );
}
