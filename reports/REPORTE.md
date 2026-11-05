# Reporte de pruebas, simulaciones y torneos — Casino Pepón 1.1 (10 juegos)

Fecha: 2026-11-05 · Entorno: Node 22, Chromium (Playwright 1.63), 4 núcleos.

## Resumen

| Área | Resultado |
|---|---|
| Compilación (`tsc -b` estricto + `vite build`) | Sin errores ni advertencias de tipos. Bundle inicial 294 KB (97.6 KB gzip); pantallas de juego cargadas bajo demanda; 24 recursos precacheados para uso offline. |
| Pruebas unitarias (Vitest) | **120 / 120** aprobadas en 9 archivos (~10 s). |
| Pruebas end-to-end y responsivas (Playwright) | **44 / 44** aprobadas (~43 s). |
| Simulaciones | 10 M manos de póker, 10 M giros de ruleta, 9.5 M rondas de blackjack y 13 M rondas de los 7 juegos adicionales: todas coinciden con la teoría. |
| Torneos de IA | El **Experto vence** a Avanzado, Intermedio y Principiante con IC 95 % muy por encima de cero en 50,000 manos por enfrentamiento. |
| Auditoría | Bugs encontrados y corregidos (ver abajo); CSP estricta sin violaciones; sin errores de consola en ninguna ruta. |

## 1. Pruebas unitarias

| Archivo | Pruebas | Cubre |
|---|---:|---|
| `rng.test.ts` | 8 | Uniformidad de `randomInt` (χ²), Fisher–Yates genera las 24 permutaciones de 4 elementos de forma uniforme, posición de cada carta uniforme, semillas deterministas, pesos. |
| `handEval.test.ts` | 6 | Las 9 categorías, rueda A-5 y escalera de color baja, kickers, mejor combinación de 7 cartas, **enumeración completa de las 2,598,960 manos de 5 cartas** con las frecuencias exactas y las 7,462 clases distintas. |
| `poker.test.ts` | 23 | Ciegas y orden de acción (3 jugadores y mano a mano), rotación del botón, opción de la BB, BB corta, subida de ciegas, subida mínima, no poder pasar/retirarse ilegalmente, all-in incompleto que **no** reabre la acción y completo que **sí**, **botes secundarios con tres all-ins**, jugador corto que gana sólo el principal, **empates con ficha impar**, desempate por kicker, devolución de apuesta no igualada, reparto del tablero en all-in, eliminación y fin de juego, privacidad de la vista de jugador, e invariantes (conservación de fichas, netos que suman 0) en miles de manos aleatorias de 2 a 6 jugadores. |
| `blackjack.test.ts` | 26 | Totales duros/blandos, **pagos 3:2 y 6:5**, ganar/empatar/perder, pasarse, S17 vs H17, **doblar** (apuesta, una carta, restricciones 9–11, sin fichas), **dividir** (apuestas, DAS, ases con una carta y 21 que paga 1:1, re-división hasta el máximo), **seguro** (paga 2:1, se pierde, máximo la mitad, BJ vs BJ), ENHC, la IA no ve la carta oculta, estrategia básica contra 25 situaciones publicadas, distribución del crupier, **EV calculado vs Monte Carlo**, seguro con zapato normal/rico, conservación de fichas en 20,000 rondas con los 4 niveles, zapato de 1 mazo que nunca se agota (40,000 rondas × 5 asientos). |
| `roulette.test.ts` | 7 | Rueda de 37 casillas con colores alternados, pagos, EV = −1/37 para toda apuesta, validación de apuestas del paño, selector táctil, liquidación, uniformidad del giro. |
| `ai.test.ts` | 16 | Equity Monte Carlo (AA vs KK ≈ 82 %, AKs vs QQ ≈ 46 %, AA vs 1 y 4 rivales), equity exacta en el river, equity contra rango que continúa, rangos y texturas, outs, estimación de rango tras 3-bet, modelo de rivales (VPIP, PFR, retiradas), **legalidad de todas las acciones de los 4 niveles**, **la decisión del Experto no cambia si se alteran las cartas ocultas o el mazo**, mezcla softmax, objetivo de faroles, recomendaciones preflop, **torneo determinista** (Experto gana con IC 95 % > 0 a los tres niveles). |
| `coach.test.ts` | 5 | Recomendación y explicación de póker, pot odds y calificación de decisiones, coach de blackjack (16 vs 10 pedir, 11 vs 6 doblar, seguro), coach de ruleta (pérdida esperada y probabilidades). |
| `games.test.ts` | 24 | Video póker (clasificación, cambio de cartas, **EV exacto = valores publicados 1.5365 y 0.8237**, estrategia simple vs óptima), baccarat (tabla completa de tercera carta, pagos, ventaja simulada), Tres Dados (pagos, EV exacto, uniformidad), tragamonedas (comodín, **RTP exacto 95–97 %**, simulación converge, ventana = tira real), keno (probabilidades suman 1, RTP 90–96 %, sorteo de 20 distintos), póker de 3 cartas (ranking, calificación, liquidación, **frontera Q-6-4 por EV exacto**), Mayor o Menor (probabilidades, pagos ≤ 97 %, rebarajado). |
| `persistence.test.ts` | 5 | Perfil por defecto, guardar/recuperar, JSON corrupto o datos viejos/parciales, claves dinámicas, sesiones y borrado. |

## 2. Pruebas end-to-end y responsivas (Playwright, Chromium)

Flujos (11 pruebas): onboarding y lobby; reinicio de fichas gratis; póker completo con coach y salida devolviendo fichas; panel de subida con atajos de teclado; blackjack (apostar, jugar 3 rondas, cambiar reglas, estadísticas); ruleta (apuesta exterior, selector de combinaciones, deshacer con teclado, giro con Espacio, estadísticas e historial); "Cómo funciona" y ajustes (reducción de movimiento, sonido); **accesibilidad básica** (todo botón, enlace, interruptor y opción con nombre accesible en las 8 rutas) **sin errores de consola ni violaciones de CSP**; integridad (salir a mitad de ronda de blackjack la liquida; recargar a mitad de mano de póker cuenta como retirada); **PWA offline** (tras la primera carga, con la red desactivada la app recarga y navega).

Juegos adicionales (15 pruebas): lobby con 10 juegos y filtro por categoría; video póker con coach exacto y teclas 1–5; baccarat; póker de 3 cartas con EV; Tres Dados; tragamonedas con RTP publicado y tabla de pagos; keno; Mayor o Menor; salir durante una animación liquida la ronda; y las 7 pantallas nuevas sin scroll horizontal y con el panel de controles dentro de la pantalla en los 6 tamaños.

Responsivo (18 pruebas = 3 × 6 tamaños): **360×800, 390×844, 768×1024, 1366×768, 1920×1080** y celular horizontal **844×390**. En cada tamaño: lobby, estadísticas, historial, reglas y ajustes sin scroll horizontal; mesa de póker de 6 jugadores con los 6 asientos, el tablero y los botones dentro de la pantalla y botones de al menos 44 px de alto; blackjack y ruleta caben sin scroll horizontal. Las capturas quedan adjuntas en el reporte HTML de Playwright (`playwright-report/`).

## 3. Simulaciones (RNG criptográfico real)

Detalle completo en [`simulations.md`](simulations.md).

**Póker, 10,000,000 manos de 7 cartas:** todas las categorías dentro de ±1 σ de las probabilidades exactas (p. ej., escalera de color 0.0315 % vs 0.0311 %, full 2.600 % vs 2.596 %, pareja 43.83 % vs 43.82 %); χ² = 2.35 con 8 g.l. (crítico al 1 %: 20.09).

**Ruleta europea, 10,000,000 giros:** χ² de uniformidad = 46.3 con 36 g.l. (crítico al 1 %: 58.6). RTP simulado de pleno, caballo, transversal, cuadro, seisena, docena, columna, rojo, par y falta entre 97.10 % y 97.33 % — todos alrededor del teórico 97.30 %. **Ninguna combinación elimina la ventaja de la casa.**

**Blackjack con estrategia básica (2,000,000 rondas por conjunto de reglas):**

| Reglas | Ventaja de la casa simulada | Estimada (tabla de la app) |
|---|---:|---:|
| 6 mazos S17 DAS 3:2 (por defecto) | 0.41 % (IC 95 % 0.25–0.57 %) | 0.40 % |
| 6 mazos H17 DAS 3:2 | 0.61 % | 0.62 % |
| 6 mazos S17 DAS 6:5 | 1.79 % | 1.79 % |
| 1 mazo S17 sin DAS 3:2 | −0.01 % (IC incluye 0.09 %) | 0.09 % |

Niveles de IA de blackjack (6 mazos S17): Principiante 94.62 % RTP, Intermedio 96.48 %, Avanzado 99.59 %, Experto 99.80 %.

**Juegos adicionales** (detalle en `simulations.md`, 13 M rondas): video póker con estrategia simple 98.87 % en 2 M manos (teórico ≈ 99.46 %; error estándar ≈ 0.3 % por la varianza del premio de 800); baccarat Banca 98.87 % / Punto 98.84 % / Empate 85.73 % (teóricos 98.94 / 98.76 / 85.64 %); Tres Dados: las 5 apuestas medidas a menos de 0.25 puntos de su EV exacto; tragamonedas 97.17 % en 2 M giros (exacto 96.57 %; premios raros); póker de 3 cartas con Q-6-4 96.73 % por unidad de Ante (teórico 96.63 %) y Pair Plus 92.81 % (92.72 %); Mayor o Menor 96.62 %. La distribución de aciertos del keno coincide con la hipergeométrica (χ² = 12.1 en 3 M sorteos, RTP 92.0 % con 10 números).

## 4. Torneos automáticos de IA de póker

Detalle completo en [`tournament.md`](tournament.md). Formato duplicado (cada mazo se juega dos veces intercambiando las cartas), 100 BB, 400 simulaciones Monte Carlo por decisión del Experto (en la app usa 2,000, así que juega aún mejor).

| Enfrentamiento | Manos | bb/100 del primero | IC 95 % |
|---|---:|---:|---|
| **Experto vs Avanzado** | 50,000 | **+112.8** | [+104.1, +121.6] |
| **Experto vs Intermedio** | 50,000 | **+46.7** | [+41.0, +52.4] |
| **Experto vs Principiante** | 50,000 | **+386.6** | [+370.7, +402.5] |
| Avanzado vs Intermedio | 50,000 | +6.7 | [+0.8, +12.6] |
| Intermedio vs Principiante | 50,000 | +39.6 | [+35.5, +43.8] |
| Experto vs Experto (control) | 50,000 | +7.5 | [−6.9, +21.9] (empate, como debe ser) |
| Experto con perfiles (Güero, Chayo, Chema) vs Avanzado | 12,500 c/u | +116 a +122 | todos > +95 |

Mesa de 6 con rotación (24,000 manos): Experto **+249 bb/100**; Avanzados +63 y +30; Intermedios +87 y +59; Principiante −488.

Freezeouts mano a mano (150 partidas por rival): el Experto gana 79.3 % contra Avanzado, 72.7 % contra Intermedio y 75.3 % contra Principiante (los tres con IC 95 % por encima de 65 %).

**Conclusión:** el Experto vence de forma estadísticamente significativa y amplia a los tres niveles; el control Experto vs Experto da un empate, lo que valida el arnés.

## 5. Auditoría

**Bugs encontrados y corregidos durante el proceso**

1. *IA Experta explotable por Intermedio* (perdía −298 bb/100 en la primera versión): sobreestimaba la fold equity en guerras de re-subidas preflop. Se agregaron al modelo de rivales las estadísticas "retirarse ante subida", "ante re-subida" (separadas preflop/postflop) y "volver a subir", una rama de EV para la re-subida y una equity condicionada calculada con simulación propia. Resultado: +46.7 bb/100.
2. *All-ins sobredimensionados* con poca ganancia esperada: el all-in ahora sólo es candidato con SPR bajo o tamaños razonables, y se penaliza el riesgo de modelo.
3. *Zapato agotado con 1 mazo* (detectado por la simulación masiva): re-barajado de descartes de emergencia y barajado preventivo si quedan pocas cartas. Prueba de regresión agregada.
4. *Columna de la cuadrícula más ancha que la pantalla* en las mesas (oculta por `overflow: hidden`, recortaba asientos en 360 px; detectado por las pruebas responsivas): `grid-template-columns: minmax(0, 1fr)`.
5. *Integridad:* salir o recargar a mitad de mano/ronda podía anular una mano perdedora. Ahora cuenta como retirada (póker), se resuelve con estrategia básica (blackjack) o se liquida (ruleta).
6. *Premio de "una cereza" que pagaba menos que la apuesta* y se celebraba como victoria (patrón de "pérdida disfrazada de premio"): eliminado; los premios parciales se muestran como pérdida.
7. *Keno de 10 números con RTP simulado de 103.65 %*: se verificó que la distribución de aciertos es exacta; fue varianza de un premio enorme.
8. *Coach mostrando un "EV" heurístico* en aperturas preflop: ahora muestra "abrir con top X %" y lo explica.

**Rendimiento:** una decisión del Experto tarda ~9 ms de mediana (p95 < 25 ms) y el coach ~15 ms (p95 < 26 ms), ejecutadas en Web Workers; la interfaz no se bloquea.

**Accesibilidad:** nombres accesibles verificados automáticamente, región `aria-live`, foco visible y atrapado en diálogos, reducción de movimiento, contraste alto, objetivos táctiles amplios, atajos de teclado.

**Seguridad y privacidad:** CSP estricta sin violaciones, sin `eval`/`innerHTML`, sin peticiones externas, sin cuentas ni datos personales; todo el progreso vive en `localStorage` y se valida al cargar. Sin dinero real, compras, anuncios ni premios.

Limitaciones conocidas: ver [`../docs/DECISIONES.md`](../docs/DECISIONES.md#limitaciones-conocidas).
