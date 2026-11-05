# Casino Pepón

Un casino para aprender con **fichas virtuales sin valor real**: Texas Hold'em No-Limit contra rivales de IA, blackjack con reglas configurables y ruleta europea. Incluye un **coach** que recomienda la jugada antes de que actúes, la explica en español sencillo con los números clave (equity, pot odds, valor esperado) y revisa cada mano al terminar.

- Sin dinero real, depósitos, retiros, premios canjeables, compras, anuncios ni cuentas.
- Sin patrones de presión: no hay bonos por racha, temporizadores ni "casi ganas". Puedes **reiniciar las fichas gratis** cuando quieras y activar un recordatorio de pausa.
- PWA instalable que funciona **sin conexión** después de la primera carga. Todo se guarda localmente en el dispositivo.

## Qué incluye

| Juego | Características |
|---|---|
| **Texas Hold'em No-Limit** | 1 a 5 rivales de IA (Principiante, Intermedio, Avanzado, Experto o Mixto), 8 personajes con estilo propio. Ciegas, posiciones, subida mínima, all-in incompleto que no reabre la acción, devolución de apuesta no igualada, botes secundarios, empates con ficha impar, eliminación y ciegas que suben (opcional). |
| **Blackjack** | Pedir, plantarse, doblar, dividir (re-división hasta 4 manos) y seguro. Reglas configurables: 1–8 mazos, H17/S17, pago 3:2 o 6:5, doblar después de dividir, doblar sólo 9–11 o 10–11, re-dividir y pedir con ases, revisión del crupier (americana o europea) y penetración. 0–2 compañeros de mesa con IA. |
| **Ruleta europea** | Pleno, caballo, transversal, cuadro, seisena, trío, primeros cuatro, docenas, columnas y apuestas sencillas. Selector táctil de combinaciones, deshacer, repetir, historial, frecuencias y explicación de probabilidades: ninguna estrategia elimina la ventaja de la casa (−2.70 %). |

Además: onboarding breve, tutorial por juego, estadísticas con áreas de mejora, historial de manos, sección "Cómo funciona" con reglas y probabilidades, ajustes (sonido sintetizado opcional, reducción de movimiento, ritmo de la IA, vibración, baraja de cuatro colores, recordatorio de pausa) y atajos de teclado.

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
| `npm test` | Pruebas unitarias (Vitest): RNG y Fisher–Yates, evaluador (enumera las 2,598,960 manos de 5 cartas), motor de póker (ciegas, subidas, all-ins, botes secundarios, empates, eliminación, invariantes con miles de manos aleatorias), blackjack (pagos, doblar, dividir, seguro, H17/S17, ENHC, zapato), ruleta, EV de blackjack contra Monte Carlo, IA (legalidad, privacidad, rangos, equity) **y un torneo determinista** que exige que el Experto gane con IC 95 % > 0. |
| `npm run e2e` | Pruebas end-to-end con Playwright (construye y sirve la app): flujos principales de los tres juegos, coach, reinicio de fichas, integridad al salir o recargar, PWA offline, accesibilidad básica y **pruebas responsivas** en 360×800, 390×844, 768×1024, 1366×768, 1920×1080 y celular horizontal 844×390. Si tu Chromium está en otra ruta, usa `PW_CHROMIUM_PATH=/ruta/a/chromium npm run e2e`. |
| `npm run sim` | Simulaciones masivas con el RNG criptográfico real: 10 M manos de póker de 7 cartas, 10 M giros de ruleta y ~9.5 M rondas de blackjack con distintas reglas y niveles. Escribe `reports/simulations.md`. Usa `-- --quick` para una muestra pequeña. |
| `npm run tournament` | Torneos automáticos entre niveles de IA (mano a mano duplicado de 50,000 manos por enfrentamiento, mesa de 6 y freezeouts), en paralelo. Escribe `reports/tournament.md`. Usa `-- --quick` para una muestra pequeña. |
| `npm run typecheck` | Verificación de tipos con TypeScript estricto. |

Los resultados más recientes están en [`reports/REPORTE.md`](reports/REPORTE.md).

## Despliegue

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
  ai/
    poker/       Combos y rangos, Monte Carlo, modelo de rivales, análisis EV, bots por nivel, perfiles, arnés de torneos
    blackjack/   EV exacto por acción, estrategia básica, niveles
  coach/         Recomendaciones, explicaciones y revisión post-mano de los tres juegos
  workers/       Web Worker de IA y cliente RPC (con respaldo en el hilo principal)
  persistence/   Esquema del progreso y almacenamiento local tolerante a errores
  audio/         Efectos de sonido sintetizados (Web Audio)
  ui/            React: pantallas, componentes, estilos
tests/unit/      Vitest
e2e/             Playwright (flujos y responsivo)
scripts/         Simulaciones, torneos y generación de tablas preflop
reports/         Resultados de simulaciones y torneos
docs/            Decisiones técnicas y limitaciones
```

La separación es estricta: los motores no conocen la interfaz; la IA sólo recibe una **vista de jugador** (sin mazo ni cartas ocultas); la interfaz usa los motores, la IA vía Web Worker y la persistencia. Ver [`docs/DECISIONES.md`](docs/DECISIONES.md).

## Juego responsable

Casino Pepón es entretenimiento y aprendizaje. Las fichas son virtuales, no se compran ni se canjean. Si sientes que el juego con dinero real te causa problemas, busca apoyo profesional.
