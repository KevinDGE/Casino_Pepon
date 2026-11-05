# Torneos automáticos de IA de póker

Generado: 2026-11-05T06:38:07.609Z · Simulaciones Monte Carlo por decisión del Experto: 400 · Duración: 202 s

## 1. Mano a mano duplicado (100 BB, cash)

Cada mazo se juega dos veces con las cartas intercambiadas. bb/100 = ciegas grandes ganadas por cada 100 manos por el primer bot.

| Enfrentamiento | Manos | bb/100 | Error est. | IC 95 % | ¿Significativo? |
|---|---:|---:|---:|---|---|
| Experto-vs-Avanzado | 50,000 | 112.8 | 4.4 | [104.1, 121.6] | Sí, gana el primero |
| Experto-vs-Intermedio | 50,000 | 46.7 | 2.9 | [41.0, 52.4] | Sí, gana el primero |
| Avanzado-vs-Intermedio | 50,000 | 6.7 | 3.0 | [0.8, 12.6] | Sí, gana el primero |
| Intermedio-vs-Principiante | 50,000 | 39.6 | 2.1 | [35.5, 43.8] | Sí, gana el primero |
| Experto-vs-Principiante | 50,000 | 386.6 | 8.1 | [370.7, 402.5] | Sí, gana el primero |
| Experto(guero)-vs-Avanzado | 12,500 | 122.0 | 10.0 | [102.5, 141.6] | Sí, gana el primero |
| Experto(chayo)-vs-Avanzado | 12,500 | 117.5 | 9.0 | [99.8, 135.2] | Sí, gana el primero |
| Experto(chema)-vs-Avanzado | 12,500 | 116.5 | 10.8 | [95.4, 137.6] | Sí, gana el primero |
| Experto-vs-Experto | 50,000 | 7.5 | 7.3 | [-6.9, 21.9] | No (empate estadístico) |

## 2. Mesa de 6 jugadores (rotación de asientos)

| Bot | Nivel | bb/100 | Error est. |
|---|---|---:|---:|
| E1 | Experto | 249.1 | 15.3 |
| A1 | Avanzado | 62.6 | 14.6 |
| I1 | Intermedio | 86.8 | 14.5 |
| B1 | Principiante | -488.4 | 19.6 |
| A2 | Avanzado | 30.4 | 13.8 |
| I2 | Intermedio | 59.4 | 13.9 |

## 3. Freezeouts mano a mano (50 BB, ciegas que se duplican cada 40 manos)

| Enfrentamiento | Partidas | Victorias del Experto | % | IC 95 % (Wilson) |
|---|---:|---:|---:|---|
| Experto-vs-Avanzado | 150 | 119 | 79.3% | [72.2%, 85.0%] |
| Experto-vs-Intermedio | 150 | 109 | 72.7% | [65.0%, 79.2%] |
| Experto-vs-Principiante | 150 | 113 | 75.3% | [67.9%, 81.5%] |
