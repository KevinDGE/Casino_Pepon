# Casino Pepón

Un casino para aprender con **fichas virtuales sin valor real** y **10 juegos**: Texas Hold'em No-Limit contra rivales de IA, blackjack con reglas configurables, ruleta europea, video póker, baccarat, póker de 3 cartas, Tres Dados, la tragamonedas "Fiesta Pepona", keno y Mayor o Menor. Incluye un **coach** que recomienda la jugada antes de que actúes, la explica en español sencillo con los números clave (equity, pot odds, valor esperado) y revisa cada mano al terminar.

- Sin dinero real, depósitos, retiros, premios canjeables, compras, anuncios ni cuentas.
- Sin patrones de presión: no hay bonos por racha, temporizadores ni "casi ganas". Puedes **reiniciar las fichas gratis** cuando quieras y activar un recordatorio de pausa.
- PWA instalable que funciona **sin conexión** después de la primera carga. Todo se guarda localmente en el dispositivo.

## Qué incluye

| Juego | Características |
|---|---|
| **Texas Hold'em No-Limit** | 1 a 5 rivales de IA (Principiante, Intermedio, Avanzado, Experto o Mixto), 8 personajes con estilo propio. Ciegas, posiciones, subida mínima, all-in incompleto que no reabre la acción, devolución de apuesta no igualada, botes secundarios, empates con ficha impar, eliminación y ciegas que suben (opcional). |
| **Blackjack** | Pedir, plantarse, doblar, dividir (re-división hasta 4 manos) y seguro. Reglas configurables: 1–8 mazos, H17/S17, pago 3:2 o 6:5, doblar después de dividir, doblar sólo 9–11 o 10–11, re-dividir y pedir con ases, revisión del crupier (americana o europea) y penetración. 0–2 compañeros de mesa con IA. |
| **Ruleta europea** | Pleno, caballo, transversal, cuadro, seisena, trío, primeros cuatro, docenas, columnas y apuestas sencillas. Selector táctil de combinaciones, deshacer, repetir, historial, frecuencias y explicación de probabilidades: ninguna estrategia elimina la ventaja de la casa (−2.70 %). |
| **Video póker** | Jotas o mejor con tabla completa 9/6, 1–5 monedas. El coach calcula el **EV exacto de las 32 formas de conservar cartas** (hasta 1.5 M combinaciones por opción, en un Web Worker). RTP 99.54 % jugando perfecto. |
| **Baccarat** | Punto, Banca (comisión 5 %), Empate y Parejas; reglas de tercera carta automáticas, zapato de 8 mazos y "camino" de resultados. |
| **Póker de 3 cartas** | Ante/Jugar contra el crupier (califica con dama alta), bono de Ante y Pair Plus. El coach enumera las 18,424 manos posibles del crupier para el EV exacto de jugar o retirarse. |
| **Tres Dados** | Chico/Grande, Par/Impar, sumas, dobles, triples, números y combinaciones; EV exacto de cada apuesta sobre los 216 resultados. |
| **Fiesta Pepona** | Tragamonedas de 3 carretes y 5 líneas con símbolos originales. **RTP exacto 96.57 %** calculado sobre las 27,000 combinaciones. Sin giro automático, sin "casi ganas" fabricados y sin disfrazar pérdidas de premios. |
| **Keno** | Elige 1–10 de 80 números; se sortean 20. Tabla de pagos con probabilidades hipergeométricas exactas (RTP 92–95 %). |
| **Mayor o Menor** | Adivina si la siguiente carta será mayor, menor o igual; pagos calculados con las cartas que quedan y 3 % de ventaja fija. |

Además: diseño premium con tipografías empaquetadas (Playfair Display e Inter, funcionan offline), lobby con categorías e ilustraciones originales, celebraciones animadas sólo cuando hay ganancia real, onboarding breve, tutorial por juego, estadísticas con áreas de mejora, historial de manos, sección "Cómo funciona" con reglas y probabilidades, ajustes (sonido sintetizado opcional, reducción de movimiento, ritmo de la IA, vibración, baraja de cuatro colores, recordatorio de pausa) y atajos de teclado.

## Requisitos

- Node.js 20 o superior (probado con Node 22) y npm.
- Para las pruebas end-to-end: Chromium de Playwright (`npx playwright install chromium` si tu equipo no lo tiene).

## Instalación y ejecución

```bash
npm install
```

```bash
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173`). En el modo de desarrollo el service worker no se registra; para probar la PWA usa la build de producción:

```bash
npm run build
```

```bash
npm run preview
```

y abre `http://localhost:4173`.

## Pruebas

| Comando | Qué hace |
|---|---|
| `npm test` | 120 pruebas unitarias (Vitest): RNG y Fisher–Yates, evaluador (enumera las 2,598,960 manos de 5 cartas), motor de póker (ciegas, subidas, all-ins, botes secundarios, empates, eliminación, invariantes con miles de manos aleatorias), blackjack (pagos, doblar, dividir, seguro, H17/S17, ENHC, zapato), ruleta, EV de blackjack contra Monte Carlo, IA (legalidad, privacidad, rangos, equity) **y un torneo determinista** que exige que el Experto gane con IC 95 % > 0; además los 7 juegos adicionales (EV de video póker contra valores publicados, tercera carta de baccarat, EV exacto de dados, RTP exacto de la tragamonedas, probabilidades de keno, estrategia Q-6-4, pagos de Mayor o Menor). |
| `npm run e2e` | 44 pruebas end-to-end con Playwright (construye y sirve la app): flujos principales de los 10 juegos, coach, reinicio de fichas, integridad al salir o recargar, PWA offline, accesibilidad básica y **pruebas responsivas** en 360×800, 390×844, 768×1024, 1366×768, 1920×1080 y celular horizontal 844×390. Si tu Chromium está en otra ruta, usa `PW_CHROMIUM_PATH=/ruta/a/chromium npm run e2e`. |
| `npm run sim` | Simulaciones masivas con el RNG criptográfico real: 10 M manos de póker de 7 cartas, 10 M giros de ruleta, ~9.5 M rondas de blackjack y 13 M rondas de los juegos adicionales. Escribe `reports/simulations.md`. Usa `-- --quick` para una muestra pequeña. |
| `npm run tournament` | Torneos automáticos entre niveles de IA (mano a mano duplicado de 50,000 manos por enfrentamiento, mesa de 6 y freezeouts), en paralelo. Escribe `reports/tournament.md`. Usa `-- --quick` para una muestra pequeña. |
| `npm run typecheck` | Verificación de tipos con TypeScript estricto. |

Los resultados más recientes están en [`reports/REPORTE.md`](reports/REPORTE.md).

## Póker en línea (multijugador en tiempo real)

En la versión publicada en claude.ai, **Póker en línea** permite crear mesas de Texas Hold'em de 2 a 6 personas o sentarse en una abierta. No hay servidor: la mesa funciona sobre la base de datos compartida del Artifact y cada navegador reconstruye la mano de forma determinista con el mismo motor de reglas.

- **Nadie ve tus cartas, ni quien hospeda la mesa.** Se usa *póker mental* con cifrado conmutativo SRA (primo seguro de 1024 bits). Cada jugador cifra y baraja el mazo por turnos con su propia clave secreta; cada carta propia se descifra sólo en el navegador de su dueño y las comunitarias se revelan cuando todos quitan su capa. Las cartas de quienes se retiran nunca se revelan.
- Las cartas reveladas se verifican: si alguien publica una carta inválida o repetida, la mano se anula. Si alguien se desconecta, quien hospeda lo retira de su turno o anula la mano sin que nadie pierda fichas.
- Cada persona escribe sólo su propio documento (`mp/<id>`) y nadie puede alterar el de otro.
- El coach está desactivado en estas mesas para que el juego sea justo entre personas. Los resultados cuentan para el ranking.

## Jugar en línea y ranking

La versión en línea está publicada como Artifact de claude.ai: **https://claude.ai/artifact/5LL37jdE1v1oMNnKG3sP5r**. Es privada por defecto; quien la publicó la comparte desde el menú *Compartir* de la página.

El **ranking diario, semanal y mensual** cuenta las fichas netas ganadas en todos los juegos en cada periodo (hora de la Ciudad de México; semana de lunes a domingo). Reiniciar fichas no cuenta. Usa la base de datos compartida del Artifact:

- Un documento por persona (`ranking/<id>`), con un identificador opaco; los nombres se resuelven al mostrar.
- Todos los que pueden abrir la página leen el ranking; cada quien escribe sólo su propio puntaje (regla `ranking/{self}`), y sólo el dueño puede moderar.
- Para **aparecer** en el ranking hace falta acceso de **Colaborador** (o ser de la misma organización y entrar por enlace); con acceso de sólo lectura se ve el ranking pero no se publica el puntaje.
- En GitHub Pages el ranking y las mesas en línea funcionan sobre Firebase (ver abajo). En cualquier otra build local u otro hosting no hay ranking compartido: la pantalla muestra sólo tus propios resultados.

Para volver a publicar después de cambios:

```bash
npm run build:artifact
```

y publica `dist-artifact/casino-pepon.html` con los archivos listados en `dist-artifact/files.json` (capacidades `db` con las reglas de `src/ranking/online.ts` y `user` con alcance `profile`).

## Despliegue

### GitHub Pages (automático)

El flujo `.github/workflows/pages.yml` corre las pruebas unitarias, construye la PWA y la publica en **https://kevindge.github.io/Casino_Pepon/** en cada cambio a `main` (también se puede lanzar a mano desde *Actions → Publicar en GitHub Pages → Run workflow*). Sólo hay que activarlo una vez en *Settings → Pages → Build and deployment → Source: GitHub Actions*.

Esa versión no necesita cuenta: abre en cualquier navegador, se instala como app y funciona sin conexión, con todos los juegos contra la IA. Además tiene **ranking y póker en línea sobre Firebase**:

- La build se hace con `VITE_BACKEND=firebase`; sólo entonces se carga (de forma diferida) el SDK de Firebase.
- Cada navegador inicia una **sesión anónima** de Firebase (sin correo ni contraseña) y elige un **apodo** público.
- Los datos viven en Firestore con el mismo modelo que en claude.ai: `ranking/<id>` y `mp/<id>`. Todos leen; cada quien escribe sólo su documento. Las reglas están en `firebase/firestore.rules` y validan tipos y tamaños.
- `firebase/deploy.sh` publica reglas e índices, y `firebase/test-rules.py` prueba las reglas contra la API de Firebase. Ambos requieren `gcloud auth login`.
- Requisito único en la consola de Firebase: *Authentication → Comenzar → Anónimo → Habilitar*.
- El ranking de GitHub Pages y el de claude.ai son independientes: son bases de datos distintas.

### Otros hostings

La app es estática: el contenido de `dist/` se puede servir desde cualquier hosting de archivos (GitHub Pages, Netlify, Cloudflare Pages, Vercel, un bucket S3, Nginx…). Se construye con rutas relativas (`base: './'`) y enrutamiento por hash, así que funciona también en subcarpetas.

```bash
npm run build
```

Recomendaciones para el servidor:

- Servir por **HTTPS** (requisito para instalar la PWA y registrar el service worker; `localhost` también funciona).
- No cachear agresivamente `sw.js` ni `index.html` (por ejemplo `Cache-Control: no-cache`) para que las actualizaciones lleguen; los archivos de `assets/` llevan hash y pueden cachearse un año.
- La build ya incluye una Content-Security-Policy estricta en `index.html`; si tu servidor agrega encabezados, puedes replicarla como encabezado HTTP y añadir `frame-ancestors 'none'`.

## Estructura

```
src/
  core/          RNG criptográfico (rechazo sin sesgo), Fisher–Yates, cartas
  engine/        Motores de reglas puros, sin interfaz
    poker/       Evaluador de manos, máquina de estados, botes, vista de jugador
    blackjack/   Reglas, zapato, liquidación, ventaja de la casa
    roulette/    Rueda europea, validación y pago de apuestas
    videopoker/ baccarat/ threecard/ dice/ slots/ keno/ hilo/   Motores de los juegos adicionales
  ai/
    poker/       Combos y rangos, Monte Carlo, modelo de rivales, análisis EV, bots por nivel, perfiles, arnés de torneos
    blackjack/   EV exacto por acción, estrategia básica, niveles
  coach/         Recomendaciones, explicaciones y revisión post-mano de los tres juegos
  workers/       Web Worker de IA y cliente RPC (con respaldo en el hilo principal)
  persistence/   Esquema del progreso y almacenamiento local tolerante a errores
  audio/         Efectos de sonido sintetizados (Web Audio)
  ui/            React: pantallas, componentes, estilos (ui/arcade = juegos adicionales)
tests/unit/      Vitest
e2e/             Playwright (flujos y responsivo)
scripts/         Simulaciones, torneos y generación de tablas preflop
reports/         Resultados de simulaciones y torneos
docs/            Decisiones técnicas y limitaciones
```

La separación es estricta: los motores no conocen la interfaz; la IA sólo recibe una **vista de jugador** (sin mazo ni cartas ocultas); la interfaz usa los motores, la IA vía Web Worker y la persistencia. Ver [`docs/DECISIONES.md`](docs/DECISIONES.md).

## Juego responsable

Casino Pepón es entretenimiento y aprendizaje. Las fichas son virtuales, no se compran ni se canjean. Si sientes que el juego con dinero real te causa problemas, busca apoyo profesional.
