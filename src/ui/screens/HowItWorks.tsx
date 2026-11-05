import { Page } from '../components/Layout';
import { PlayingCard } from '../components/PlayingCard';
import { cs } from './cardsHelper';
import { estimateHouseEdge } from '../../engine/blackjack/houseEdge';
import { useProfile } from '../store';
import { fmtPct } from '../../coach/format';

const HANDS = [
  { name: 'Escalera real', ex: 'As Ks Qs Js Ts', five: 4, seven: 0.000032 },
  { name: 'Escalera de color', ex: '9h 8h 7h 6h 5h', five: 36, seven: 0.000279 },
  { name: 'Póker', ex: 'Qc Qd Qh Qs 2d', five: 624, seven: 0.00168 },
  { name: 'Full', ex: 'Kh Kd Ks 4c 4h', five: 3744, seven: 0.026 },
  { name: 'Color', ex: 'Ad Jd 8d 5d 2d', five: 5108, seven: 0.0303 },
  { name: 'Escalera', ex: '9c 8d 7h 6s 5c', five: 10200, seven: 0.0462 },
  { name: 'Trío', ex: '7c 7d 7h Ks 2c', five: 54912, seven: 0.0483 },
  { name: 'Doble pareja', ex: 'Jc Jd 4h 4s Ac', five: 123552, seven: 0.235 },
  { name: 'Pareja', ex: 'Tc Td Ah 8s 3c', five: 1098240, seven: 0.438 },
  { name: 'Carta alta', ex: 'Ac Qd 9h 6s 3c', five: 1302540, seven: 0.174 },
];

const ROULETTE = [
  { name: 'Pleno (1 número)', n: 1 },
  { name: 'Caballo (2)', n: 2 },
  { name: 'Transversal o trío (3)', n: 3 },
  { name: 'Cuadro o primeros cuatro (4)', n: 4 },
  { name: 'Seisena (6)', n: 6 },
  { name: 'Docena o columna (12)', n: 12 },
  { name: 'Rojo/negro, par/impar, falta/pasa (18)', n: 18 },
];

export function HowItWorks() {
  const { profile } = useProfile();
  const he = estimateHouseEdge(profile.blackjackSetup.rules);
  return (
    <Page current="how" title="Cómo funciona">
      <section className="panel">
        <h2 className="panel-title">Fichas virtuales, sin dinero real</h2>
        <p>Casino Pepón es un juego de entretenimiento y aprendizaje. Las fichas no tienen valor, no se compran, no se venden y no se canjean por premios. Puedes reiniciarlas gratis cuando quieras.</p>
      </section>
      <section className="panel">
        <h2 className="panel-title">Azar justo</h2>
        <ul className="plain-list">
          <li>Los números aleatorios vienen de <code>crypto.getRandomValues</code>, el generador criptográfico de tu navegador.</li>
          <li>Las cartas se barajan con el algoritmo <b>Fisher–Yates</b>: cada uno de los 52! órdenes posibles tiene la misma probabilidad.</li>
          <li>Para evitar el “sesgo de módulo”, los enteros se obtienen por <b>muestreo por rechazo</b>.</li>
          <li>El resultado de la ruleta se decide al girar (37 casillas equiprobables); la animación sólo lo muestra.</li>
          <li>Todo esto se valida con pruebas estadísticas automáticas (chi-cuadrada) y simulaciones de millones de rondas.</li>
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">La IA juega limpio</h2>
        <ul className="plain-list">
          <li>Los rivales reciben sólo una “vista de jugador”: sus propias cartas y lo que está a la vista en la mesa. Nunca ven tus cartas, el mazo ni las cartas por salir.</li>
          <li><b>Principiante</b>: paga mucho y casi no sube. <b>Intermedio</b>: tabla de manos y reglas simples. <b>Avanzado</b>: calcula equity contra manos aleatorias y pot odds.</li>
          <li><b>Experto</b>: estima los rangos de cada rival según sus acciones, simula miles de desenlaces (Monte Carlo), calcula el valor esperado de cada opción considerando posición, pot odds, implied odds, stacks y textura del tablero, mezcla tamaños y faroles con frecuencias controladas y se adapta a tu estilo.</li>
          <li>En torneos automáticos de 50,000 manos, el Experto vence de forma significativa a los demás niveles.</li>
        </ul>
      </section>
      <section className="panel" id="poker">
        <h2 className="panel-title">Texas Hold’em No-Limit</h2>
        <ol className="plain-list">
          <li>Cada jugador recibe 2 cartas. Antes de repartir, los dos jugadores a la izquierda del botón ponen la ciega pequeña y la grande.</li>
          <li>Rondas de apuesta: preflop, flop (3 cartas comunitarias), turn (1) y river (1). Puedes retirarte, pasar, igualar, apostar o subir.</li>
          <li>La subida mínima es igual a la última subida completa. Un all-in que no completa la subida mínima no reabre la acción.</li>
          <li>Si alguien va all-in con menos fichas, se crean botes secundarios: cada jugador sólo puede ganar lo que igualó.</li>
          <li>En el showdown gana la mejor mano de 5 cartas entre tus 2 y las 5 comunitarias. Los empates se reparten; la ficha impar va al primer ganador a la izquierda del botón.</li>
          <li>Quien se queda sin fichas queda eliminado.</li>
        </ol>
        <h3 className="sub-title">Ranking de manos y probabilidades</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Mano</th><th>Ejemplo</th><th>Combinaciones (5 cartas)</th><th>Prob. con 7 cartas</th></tr></thead>
            <tbody>
              {HANDS.map((h) => (
                <tr key={h.name}>
                  <td>{h.name}</td>
                  <td><span className="mini-cards">{cs(h.ex).map((c) => <PlayingCard key={c} card={c} size="xs" animate={false} />)}</span></td>
                  <td>{h.five.toLocaleString('es-MX')}</td>
                  <td>{fmtPct(h.seven, h.seven < 0.01 ? 3 : 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="sub-title">Conceptos que usa el coach</h3>
        <ul className="plain-list">
          <li><b>Equity</b>: tu probabilidad de ganar el bote si se viera el showdown.</li>
          <li><b>Pot odds</b>: lo que debes pagar dividido entre el bote final. Si pagas 100 para un bote de 400, necesitas 25% de equity.</li>
          <li><b>Implied odds</b>: fichas extra que puedes ganar en calles futuras si ligas tu proyecto.</li>
          <li><b>Outs</b>: cartas que mejoran tu mano. Regla rápida: outs × 4 en el flop, outs × 2 en el turn.</li>
          <li><b>SPR</b>: stack efectivo entre el bote. Con SPR bajo, una buena mano ya está comprometida.</li>
          <li><b>EV</b> (valor esperado): lo que ganas o pierdes en promedio con una decisión, medido en ciegas grandes (BB).</li>
        </ul>
      </section>
      <section className="panel" id="blackjack">
        <h2 className="panel-title">Blackjack</h2>
        <ul className="plain-list">
          <li>Objetivo: acercarte a 21 más que el crupier sin pasarte. Las figuras valen 10 y el As 1 u 11.</li>
          <li><b>Pedir</b> una carta, <b>plantarse</b>, <b>doblar</b> (doble apuesta y una sola carta), <b>dividir</b> un par en dos manos y <b>seguro</b> cuando el crupier muestra un As.</li>
          <li>Blackjack (As + 10 en las dos primeras cartas) paga 3:2 (o 6:5 si lo eliges). Un 21 después de dividir paga 1:1.</li>
          <li>Con revisión (regla americana), si el crupier tiene blackjack sólo pierdes tu apuesta original.</li>
          <li>El coach calcula el valor esperado exacto de cada acción con las reglas activas y las cartas visibles.</li>
        </ul>
        <p>Con tus reglas actuales, la ventaja de la casa con estrategia perfecta es aproximadamente <b>{fmtPct(he, 2)}</b>. Jugar sin estrategia suele costar entre 2% y 5%.</p>
      </section>
      <section className="panel" id="roulette">
        <h2 className="panel-title">Ruleta europea</h2>
        <p>37 casillas: del 1 al 36 (rojos y negros) y un solo cero verde. Cada apuesta paga 36 ÷ (números cubiertos) − 1.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Apuesta</th><th>Pago</th><th>Probabilidad</th><th>Valor esperado</th></tr></thead>
            <tbody>
              {ROULETTE.map((r) => (
                <tr key={r.n}>
                  <td>{r.name}</td>
                  <td>{36 / r.n - 1}:1</td>
                  <td>{fmtPct(r.n / 37, 2)}</td>
                  <td>−2.70%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="callout">
          <b>No existe una estrategia que elimine la ventaja de la casa.</b> Todas las apuestas tienen el mismo valor esperado de −2.70%. Sistemas como la Martingala (doblar tras perder) sólo cambian la forma de las pérdidas: muchas ganancias pequeñas y, de vez en cuando, una pérdida enorme. Los resultados anteriores no influyen en el siguiente giro.
        </div>
      </section>
    </Page>
  );
}
