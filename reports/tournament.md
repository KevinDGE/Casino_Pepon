# Torneos automáticos de IA de póker

Generado: 2026-11-05T06:03:26.568Z · Simulaciones Monte Carlo por decisión del Experto: 400 · Duración: 193 s

## 1. Mano a mano duplicado (100 BB, cash)

Cada mazo se juega dos veces con las cartas intercambiadas. bb/100 = ciegas grandes ganadas por cada 100 manos por el primer bot.

| Enfrentamiento | Manos | bb/100 | Error est. | IC 95 % | ¿Significativo? |
|---|---:|---:|---:|---|---|
| Experto-vs-Avanzado | 50,000 | 108.3 | 4.5 | [99.4, 117.1] | Sí, gana el primero |
| Experto-vs-Intermedio | 50,000 | 48.3 | 2.9 | [42.7, 53.9] | Sí, gana el primero |
| Avanzado-vs-Intermedio | 50,000 | 6.7 | 3.0 | [0.8, 12.6] | Sí, gana el primero |
| Intermedio-vs-Principiante | 50,000 | 39.6 | 2.1 | [35.5, 43.8] | Sí, gana el primero |
| Experto-vs-Principiante | 50,000 | 388.1 | 8.1 | [372.2, 404.0] | Sí, gana el primero |
| Experto(chayo)-vs-Avanzado | 12,500 | 116.7 | 8.7 | [99.6, 133.9] | Sí, gana el primero |
| Experto(guero)-vs-Avanzado | 12,500 | 131.1 | 10.3 | [111.0, 151.2] | Sí, gana el primero |
| Experto(chema)-vs-Avanzado | 12,500 | 114.2 | 10.5 | [93.6, 134.7] | Sí, gana el primero |
| Experto-vs-Experto | 50,000 | -6.0 | 7.3 | [-20.3, 8.2] | No (empate estadístico) |

## 2. Mesa de 6 jugadores (rotación de asientos)

| Bot | Nivel | bb/100 | Error est. |
|---|---|---:|---:|
| E1 | Experto | 232.6 | 15.0 |
| A1 | Avanzado | 67.1 | 14.6 |
| I1 | Intermedio | 80.2 | 14.4 |
| B1 | Principiante | -477.2 | 19.5 |
| A2 | Avanzado | 34.7 | 13.7 |
| I2 | Intermedio | 62.6 | 13.9 |

## 3. Freezeouts mano a mano (50 BB, ciegas que se duplican cada 40 manos)

| Enfrentamiento | Partidas | Victorias del Experto | % | IC 95 % (Wilson) |
|---|---:|---:|---:|---|
| Experto-vs-Avanzado | 150 | 119 | 79.3% | [72.2%, 85.0%] |
| Experto-vs-Intermedio | 150 | 110 | 73.3% | [65.7%, 79.8%] |
| Experto-vs-Principiante | 150 | 110 | 73.3% | [65.7%, 79.8%] |
