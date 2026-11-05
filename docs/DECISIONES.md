# Decisiones técnicas y limitaciones conocidas

## Identidad y alcance

- **Nombre e identidad:** "Casino Pepón", tomado del nombre del repositorio. Logotipo original: ficha con monograma "P" y corona de tres puntos, paleta esmeralda/oro/marfil. Los rivales son personajes ficticios (Doña Chayo, El Güero, Lupita, Don Fermín, La Profe Inés, Chema, Rocío, Tío Beto) con avatares de iniciales; no se usan marcas, logos ni personas reales.
- **Idioma:** español de México (`lang="es-MX"`, `Intl.NumberFormat('es-MX')`).
- **Fichas:** saldo inicial de 10,000 fichas virtuales. El botón "Reiniciar fichas gratis" está en el inicio y en Ajustes, sin límites ni esperas. No hay recompensas por racha ni temporizadores.

## Arquitectura

| Capa | Decisión |
|---|---|
| Motores (`src/engine`) | Funciones puras que mutan un estado serializable. La interfaz clona (`structuredClone`) antes de aplicar una acción para mantener inmutabilidad en React; torneos y simulaciones mutan directo por velocidad. |
| IA (`src/ai`) | Sólo recibe `PokerView` / vista de blackjack. La vista se construye en el motor y **no contiene** el mazo, las cartas por salir ni cartas ocultas de rivales (salvo las mostradas en showdown). Hay pruebas que lo verifican, incluida una que cambia las cartas ocultas y el mazo y comprueba que la vista y la decisión son idénticas. |
| Workers (`src/workers`) | Dos Web Workers (rivales y coach) con RPC por mensajes. Si el navegador no soporta workers de módulo, se usa el hilo principal como respaldo. Una decisión del Experto tarda ~9 ms de mediana (p95 < 25 ms), así que la interfaz nunca se congela. |
| Persistencia (`src/persistence`) | `localStorage` versionado con mezcla profunda sobre valores por defecto (tolera datos viejos, parciales o corruptos). Si el almacenamiento está bloqueado, la app funciona en memoria y lo avisa en Ajustes. |
| Interfaz (`src/ui`) | React 19 + TypeScript estricto, sin librerías de UI ni de estado. Enrutamiento por hash (funciona en cualquier hosting y offline). Pantallas de juego con carga diferida. |
| PWA | `vite-plugin-pwa` (Workbox `generateSW`) precachea todos los recursos; `navigateFallback` sirve la app sin conexión. Íconos generados desde un SVG propio. |
| Seguridad | CSP estricta en la build (`script-src 'self'`, `style-src 'self'`, sin `eval`, sin `innerHTML`, sin conexiones externas), `referrer` desactivado, sin dependencias en tiempo de ejecución además de React. |

## Azar

- `CryptoRng` toma bloques de 1,024 valores de `crypto.getRandomValues` (eficiente) y `randomInt` usa **muestreo por rechazo** para evitar el sesgo de módulo. El barajado es **Fisher–Yates (Durstenfeld)**.
- `SeededRng` (xoshiro128**) se usa **sólo** en pruebas, torneos y simulaciones reproducibles.
- La aleatoriedad de las estrategias mixtas de la IA también usa `CryptoRng` en la app, para que no sea predecible.
- Validación: pruebas chi-cuadrada de uniformidad (enteros, permutaciones, posición de cartas, ruleta) y simulaciones de 10 M manos/giros.

## Póker

- **Evaluador** propio con tablas de 8,192 entradas (escaleras, popcount, top-5) sin asignaciones en el camino caliente; verificado enumerando las 2,598,960 manos de 5 cartas (frecuencias exactas y 7,462 clases distintas).
- **Reglas:** en mano a mano el botón pone la ciega pequeña y habla primero preflop; BB corta obliga a igualar la ciega completa; la subida mínima es la última subida completa; un all-in incompleto no reabre la acción a quien ya habló; se devuelve la apuesta no igualada; botes secundarios por niveles de aportación; empates repartidos y fichas impares al primer ganador a la izquierda del botón.
- **Niveles de IA:**
  - *Principiante:* suelto y pasivo, paga demasiado, casi no sube.
  - *Intermedio:* tabla preflop sin posición, reglas por categoría de mano, apuestas de medio bote.
  - *Avanzado:* equity Monte Carlo contra manos aleatorias, pot odds, aperturas por posición, tamaños fijos, faroles a frecuencia fija.
  - *Experto:* estima el **rango ponderado** de cada rival a partir de sus acciones públicas y su estilo observado (VPIP, PFR, 3-bet, agresividad, retirada ante apuesta/subida/re-subida, faroles mostrados); calcula **equity Monte Carlo contra esos rangos** y una equity **condicionada al rango que continúa**; estima el **EV en fichas** de cada opción (retirarse, pasar, igualar, varios tamaños y all-in) con fold equity, riesgo de re-subida, **pot odds, implied odds, posición** (realización de equity), **SPR** y **textura**; elige con **softmax** sobre el EV (mezcla estratégica, tamaños independientes de la fuerza para no dar pistas) y **controla la frecuencia de faroles** por calle según el tamaño de apuesta (≈ b/(1+2b) en el river). Se adapta porque el modelo de rivales se actualiza mano a mano.
  - Preflop sin subidas previas el Experto usa una **tabla de apertura** por posición ajustada por el estilo de quienes faltan por hablar (más estable que el EV aproximado); el coach lo dice explícitamente y muestra "abrir con top X %" en lugar de un EV.
- **Personajes:** cada rival combina el nivel elegido con un estilo (soltura, agresividad, faroles, aleatoriedad). Nunca se muestran sus cartas ni su razonamiento.
- **Torneos:** formato **duplicado** (cada mazo se juega dos veces intercambiando las cartas) para reducir la varianza; stacks de 100 BB reiniciados cada mano; IC 95 % por error estándar. También mesa de 6 con rotación y freezeouts.

## Blackjack

- **EV exacto por acción** con la aproximación de *composición fija* dentro de la mano: la distribución final del crupier se calcula por recursión con memoria, condicionada a que no tiene blackjack cuando ya revisó; pedir/plantarse/doblar se resuelven de forma exacta para esa composición; dividir incluye re-división por punto fijo y respeta DAS, ases divididos y límite de manos.
- La estrategia básica (nivel Avanzado) se **deriva del propio calculador** con el zapato completo menos las cartas de la mano y la carta visible, y se cachea; coincide con las tablas publicadas (prueba con 25 situaciones clave).
- El coach usa sólo las cartas visibles de la ronda. El nivel Experto (compañeros de mesa) usa todas las cartas vistas desde el barajado (conteo perfecto, información legítima) y apuesta plano.
- **Ventaja de la casa** mostrada en la interfaz: tabla aditiva de efectos de reglas; las simulaciones la confirman (p. ej., 0.41 % simulado vs 0.40 % estimado con las reglas por defecto).
- Si el zapato se agota a mitad de ronda (posible con 1 mazo y muchas divisiones) se barajan los descartes; además se baraja antes de una ronda si quedan pocas cartas.

## Ruleta

- Un solo cero, 37 casillas, pago uniforme `36/n − 1`. El resultado se decide con `CryptoRng` **antes** de la animación; la rueda SVG gira hasta el número elegido.
- En celular, tocar un número coloca un pleno (modo por defecto) o abre un selector con todas las apuestas interiores que lo incluyen (modo "Elegir combinación"); así se evitan zonas táctiles diminutas entre números.

## Juegos adicionales

- **Géneros genéricos con identidad propia:** video póker "Jotas o mejor" (tipo de juego estándar), baccarat, póker de 3 cartas, dados estilo Sic Bo ("Tres Dados"), tragamonedas original "Fiesta Pepona" con símbolos dibujados en SVG, keno y Mayor o Menor. No se recrea ningún juego comercial concreto.
- **Video póker:** EV exacto por enumeración completa (≈ 2.6 M evaluaciones por mano, ~0.2 s en el worker). Coincide con los valores publicados (pareja alta 1.5365, pareja baja 0.8237). La escalera real paga 800 sólo con 5 monedas, como en las máquinas reales, y el coach lo toma en cuenta. Para simulaciones masivas se usa una estrategia simple clásica (≈ 99.46 %).
- **Tragamonedas:** tiras de 30 símbolos, paradas uniformes, ventana = tira real. RTP calculado exacto y publicado en pantalla. Decisiones anti-manipulación: **sin giro automático**, **sin "casi ganas"** fabricados, se eliminó el premio de "una cereza" (pagaba menos que la apuesta en 5 líneas) y cualquier premio menor que lo apostado se muestra como pérdida ("Recuperas X de Y"), nunca con celebración.
- **Keno:** tablas de pago calibradas para RTP entre 92 % y 95 % según la cantidad de números; probabilidades exactas mostradas en la tabla.
- **Mayor o Menor:** multiplicador = 0.97 / p, redondeado hacia abajo a centésimas; p se calcula con las cartas restantes (información visible).
- **Billetera común** (`useWallet`): descuenta la apuesta al jugar y registra estadísticas e historial al liquidar. Si se sale durante una animación, el resultado ya decidido se liquida igual; si se sale a mitad de una decisión (video póker, póker de 3 cartas), la mano se completa con la estrategia óptima/simple.
- **Celebraciones:** explosión de fichas y confeti sólo con ganancia neta; "¡Gran premio!" a partir de 10× lo apostado; se desactivan con reducción de movimiento.

## Multijugador en tiempo real

- **Sin servidor:** cada jugador publica sólo su documento `mp/<id>` (regla `mp/{self}`); todos los de la mesa lo leen en vivo. La mano se reconstruye de forma pura y determinista en cada navegador (`src/mp/protocol.ts`) a partir de la alineación que publica quien hospeda (jugadores, fichas, botón) y de los mensajes de cada jugador.
- **Póker mental (SRA):** primo seguro de 1024 bits; las cartas se codifican como residuos cuadráticos. Barajado en cadena (cada quien cifra y permuta), pase de reparto (cada quien quita su capa de las cartas ajenas; la última capa de tus cartas sólo la quitas tú), revelado de cada calle (todos quitan su capa) y, en el showdown, sólo quienes siguen en la mano publican su clave. Las operaciones corren en un Web Worker (~150 ms por paso de barajado).
- **Motor con cartas cifradas:** el mazo usa −1 para cartas aún desconocidas; el motor se pausa (`awaitCards`, `awaitShowdown`) y continúa con `continueHand` cuando se descifran. El juego contra la IA no cambia.
- **Quien hospeda** sólo arma la alineación de cada mano, retira por inactividad (50 s) y anula manos atoradas. No puede ver cartas ajenas ni falsificar acciones de otros.
- **Probado** con una simulación completa de 3 jugadores durante 6 manos (privacidad, conservación de fichas, reconstrucciones idénticas, detección de una carta manipulada) y una prueba e2e con dos navegadores independientes que juegan una mano completa.

## Ranking en línea

- **Dónde vive:** la app no tiene servidor propio; el ranking usa la base de datos compartida del Artifact de claude.ai. Fuera de claude.ai la pantalla de ranking funciona en modo local.
- **Métrica:** fichas netas ganadas por periodo (día, semana ISO de lunes a domingo, mes), en hora de la Ciudad de México, sumando todos los juegos. Reiniciar fichas no suma. Se exige al menos una ronda para aparecer; se muestran los primeros 50.
- **Privacidad y permisos:** se guarda sólo el identificador opaco de la persona (nunca nombre ni correo); todos leen, cada quien escribe sólo su documento, el dueño modera. Los datos de otras personas se tratan como no confiables (se validan como números).
- **Build para claude.ai:** `npm run build:artifact` genera una versión sin service worker ni CSP propia (la plataforma sirve la página en su propio marco con su propia política) y con enrutamiento por hash simple (`#poker`), que es lo que conservan los enlaces de claude.ai.

## Coach y estadísticas

- Póker: recomendación con equity, pot odds, EV por opción, outs, posición, SPR, textura y estilo del rival. Revisión: cada decisión se califica por la pérdida de EV frente a la mejor opción (acierto / imprecisión / error) y se etiqueta el tipo de error para "áreas de mejora".
- Blackjack: EV de cada acción en % de la apuesta, probabilidad de pasarse y de que el crupier se pase, análisis del seguro.
- Ruleta: pérdida esperada, probabilidad de ganar algo y de terminar con ganancia, desviación típica; mensaje claro de que no hay estrategia ganadora.

## Integridad de las partidas

- Póker: salir de la mesa a mitad de mano cuenta como retirarse (se pierde lo apostado en esa mano). Si se cierra o recarga la página a mitad de mano, al volver se aplica lo mismo.
- Blackjack: la apuesta se descuenta al repartir; si se sale a mitad de ronda, la ronda se completa con estrategia básica y se liquida.
- Ruleta: si se sale durante el giro, el resultado (ya decidido) se liquida igual.

## Accesibilidad y UX

- Diseño mobile-first desde 360 px; sin scroll horizontal (verificado en 6 tamaños, vertical y horizontal); zonas seguras con `env(safe-area-inset-*)`; botones de acción de ≥ 46–54 px de alto.
- Etiquetas accesibles en cartas (`role="img"`, "as de picas"), asientos, fichas y controles; región `aria-live` que anuncia acciones y resultados; diálogos con foco atrapado y Escape; foco visible; contraste alto (texto claro sobre fondo muy oscuro).
- Reducción de movimiento: respeta `prefers-reduced-motion` y tiene un ajuste propio. Sonido opcional y apagado por defecto.

## Limitaciones conocidas

1. **IA de póker:** el Experto es fuerte contra los demás niveles y se adapta, pero no es una estrategia de equilibrio (GTO) calculada por un solver; el EV de cada opción es una estimación (no modela todas las calles futuras ni rangos de re-subida exactos). Contra jugadores humanos expertos puede ser explotable.
2. **Botón muerto:** el botón avanza al siguiente jugador vivo; no se implementan las reglas de "botón muerto" de torneos presenciales cuando hay eliminaciones. Siempre se muestran las cartas de todos los que llegan al showdown (no hay opción de "tirar sin mostrar").
3. **Varios all-in incompletos** que sumados equivalen a una subida completa no reabren la acción (regla simplificada; las reglas TDA varían).
4. **EV de blackjack:** composición fija dentro de la mano; con 1–2 mazos puede diferir unas décimas de punto porcentual del análisis combinatorio exacto. La re-división se aproxima por punto fijo. No hay rendición (surrender).
5. **Zapato de blackjack:** no se guarda entre sesiones; al abrir la app se baraja uno nuevo.
6. **Persistencia:** sólo local (por navegador y dispositivo). Borrar los datos del sitio borra el progreso. Si se cierra la pestaña de golpe durante una ronda de blackjack o un giro, esa ronda puede quedar sin liquidar (la apuesta ya descontada no se devuelve).
7. **Sonido:** efectos sintetizados sencillos; algunos navegadores sólo permiten audio tras una interacción.
8. **Multijugador:** sin servidor, la verificación es parcial: se detectan cartas inválidas o repetidas al revelarse, pero no se prueba criptográficamente que cada barajado sea una permutación honesta (requeriría pruebas de conocimiento cero o revelar todas las claves, lo que mostraría las cartas de quienes se retiraron). Las fichas de la mesa las calcula cada navegador y quien hospeda publica las de cada mano; un anfitrión malicioso podría alterarlas (cada jugador ve sus propias fichas). Repartir tarda unos segundos porque cada carta pasa por todos los jugadores. Si quien hospeda se va, la mesa se cierra y cada quien recupera sus fichas de la última mano completa. Quien tenga acceso de sólo lectura no puede sentarse.
9. **Ranking:** el puntaje se calcula en el navegador de cada persona, así que alguien con conocimientos técnicos podría publicar un número falso para su propio documento (no puede tocar el de otros). Para un ranking a prueba de trampas haría falta un servidor que ejecute las partidas. En claude.ai, quien sólo tiene acceso de lectura ve el ranking pero no aparece en él.
10. **Juegos adicionales:** baccarat usa la ventaja de la casa publicada para 8 mazos (verificada por simulación) en lugar de un cálculo combinatorio propio; el keno de 9–10 números y la tragamonedas tienen premios tan raros que su RTP simulado en 1–2 M rondas puede desviarse varios puntos del exacto.
11. **Pruebas e2e:** se ejecutan en Chromium. La app usa APIs estándar (Web Workers de módulo, Service Worker, Web Audio) disponibles en Safari y Firefox modernos, pero no se automatizaron pruebas en esos motores.
