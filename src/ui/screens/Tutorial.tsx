import { useState } from 'react';
import { Modal } from '../components/Modal';

export type GameId = 'poker' | 'blackjack' | 'roulette' | 'videopoker' | 'baccarat' | 'trescartas' | 'dados' | 'tragamonedas' | 'keno' | 'mayormenor';

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
  videopoker: {
    title: 'Tutorial: Video póker (Jotas o mejor)',
    steps: [
      { h: 'Cómo se juega', p: ['Elige cuántas monedas apostar (1 a 5) y su valor, y toca “Repartir”. Recibes 5 cartas.', 'Toca las cartas que quieres conservar (o teclas 1–5) y luego “Cambiar”: las demás se reemplazan una sola vez.'] },
      { h: 'Premios', p: ['Pagan desde una pareja de jotas o mejor. La escalera real paga 800 por moneda sólo con 5 monedas; con menos paga 250.'] },
      { h: 'Coach exacto', p: ['El coach calcula el valor esperado de las 32 formas posibles de conservar cartas, revisando todas las cartas que podrían salir. Jugando perfecto se recupera 99.54% de lo apostado a largo plazo.'] },
    ],
  },
  baccarat: {
    title: 'Tutorial: Baccarat',
    steps: [
      { h: 'Punto y Banca', p: ['Apuesta a Punto, Banca o Empate (y si quieres a las parejas). Gana la mano que más se acerque a 9.', 'Las figuras y el 10 valen 0, el As vale 1 y sólo cuenta la última cifra (7 + 8 = 5).'] },
      { h: 'Tercera carta', p: ['Las reglas para pedir una tercera carta son fijas y automáticas: no tomas decisiones durante la mano.'] },
      { h: 'Lo que dicen los números', p: ['Banca tiene la menor ventaja de la casa (1.06%) aunque paga 0.95:1. El Empate paga 8:1 pero su ventaja es de 14.36%.', 'El camino de resultados es sólo historial: las rachas no predicen la siguiente mano.'] },
    ],
  },
  trescartas: {
    title: 'Tutorial: Póker de 3 cartas',
    steps: [
      { h: 'Ante y Pair Plus', p: ['Pon tu Ante (obligatoria) y, si quieres, Pair Plus. Recibes 3 cartas y el crupier otras 3 boca abajo.'] },
      { h: 'Jugar o retirarte', p: ['Para seguir pones una apuesta Jugar igual al Ante; si te retiras pierdes el Ante.', 'El crupier necesita dama alta para calificar: si no califica, el Ante paga 1:1 y Jugar se devuelve.'] },
      { h: 'Estrategia', p: ['La estrategia óptima es jugar con dama-6-4 o mejor. El coach te muestra el EV exacto de jugar contra retirarte.', 'Ranking de 3 cartas: escalera de color, trío, escalera, color, pareja, carta alta (la escalera supera al color).'] },
    ],
  },
  dados: {
    title: 'Tutorial: Tres Dados',
    steps: [
      { h: 'Apuestas', p: ['Elige el valor de ficha y toca las casillas: Chico (4–10), Grande (11–17), Par/Impar, sumas exactas, dobles, triples, números y combinaciones.', 'Chico, Grande, Par e Impar pierden si sale un triple.'] },
      { h: 'Probabilidades exactas', p: ['Con 3 dados hay 216 resultados igual de probables. El coach muestra la probabilidad y la ventaja de la casa de cada apuesta: desde 2.78% (Chico/Grande) hasta más de 30% en algunas sumas.'] },
    ],
  },
  tragamonedas: {
    title: 'Tutorial: Fiesta Pepona',
    steps: [
      { h: 'Cómo se juega', p: ['Elige la apuesta por línea y cuántas líneas juegas (1 a 5), y toca “Girar” (o Espacio).', 'Tres símbolos iguales en una línea pagan según la tabla. El Pepón es comodín. Dos cerezas a la izquierda pagan 3.'] },
      { h: 'Transparencia', p: ['Cada carrete se detiene en una posición al azar de su tira real: no hay “casi ganas” fabricados.', 'El RTP exacto (96.57%) se calcula revisando las 27,000 combinaciones posibles. Si un premio es menor que tu apuesta, la máquina te lo dice como pérdida, no como victoria.'] },
    ],
  },
  keno: {
    title: 'Tutorial: Keno',
    steps: [
      { h: 'Elige tus números', p: ['Marca de 1 a 10 números del 1 al 80 (o usa “Al azar”). Luego elige tu apuesta y toca “Sortear”.', 'Se sacan 20 números. Cobras según cuántos de los tuyos salieron.'] },
      { h: 'Probabilidades', p: ['La tabla de pagos muestra la probabilidad exacta de cada número de aciertos (distribución hipergeométrica) y el RTP de la cantidad que elegiste.'] },
    ],
  },
  mayormenor: {
    title: 'Tutorial: Mayor o Menor',
    steps: [
      { h: 'Cómo se juega', p: ['Ves una carta. Apuesta si la siguiente será mayor, menor o igual (por número; el As es la más alta).'] },
      { h: 'Pagos justos y claros', p: ['El pago de cada opción se calcula con las cartas que quedan en el mazo y una ventaja fija de la casa de 3%. Así siempre sabes tu probabilidad real.'] },
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
