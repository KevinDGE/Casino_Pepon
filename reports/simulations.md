# Simulaciones de probabilidades y RTP

Generado: 2026-11-05T07:15:58.058Z · RNG: crypto.getRandomValues (CryptoRng) · Duración: 26 s

## 1. Póker: frecuencia de manos con 7 cartas (10,000,000 manos)

| Mano | Simulado | Exacto | Diferencia (σ) |
|---|---:|---:|---:|
| Escalera de color | 0.0315% | 0.0311% | 0.71 |
| Póker | 0.1700% | 0.1681% | 1.49 |
| Full | 2.5888% | 2.5961% | -1.46 |
| Color | 3.0313% | 3.0255% | 1.08 |
| Escalera | 4.6066% | 4.6194% | -1.93 |
| Trío | 4.8319% | 4.8299% | 0.31 |
| Doble pareja | 23.5252% | 23.4955% | 2.21 |
| Pareja | 43.8040% | 43.8225% | -1.18 |
| Carta alta | 17.4107% | 17.4119% | -0.10 |

Chi-cuadrada (8 g.l.): 14.10 (valor crítico p=0.01: 20.09) → consistente con las probabilidades exactas.

## 2. Ruleta europea (10,000,000 giros)

Uniformidad de los 37 números: chi-cuadrada = 43.61 (36 g.l., crítico p=0.01: 58.62) → uniforme.

| Apuesta (1 ficha por giro) | RTP simulado | RTP teórico |
|---|---:|---:|
| straight | 97.319% | 97.297% |
| split | 97.110% | 97.297% |
| street | 97.351% | 97.297% |
| corner | 97.179% | 97.297% |
| sixline | 97.207% | 97.297% |
| dozen | 97.224% | 97.297% |
| column | 97.326% | 97.297% |
| red | 97.327% | 97.297% |
| even | 97.285% | 97.297% |
| low | 97.400% | 97.297% |

Todas las apuestas convergen al mismo RTP de 36/37 ≈ 97.30 %: ninguna combinación elimina la ventaja de la casa.

## 3. Blackjack: RTP por reglas (estrategia básica = nivel Avanzado)

| Reglas | Rondas | RTP simulado | IC 95 % | Ventaja casa simulada | Ventaja casa estimada (tabla) |
|---|---:|---:|---|---:|---:|
| 6 mazos S17 DAS 3:2 (por defecto) | 2,000,000 | 99.66% | [99.50%, 99.82%] | 0.34% | 0.40% |
| 6 mazos H17 DAS 3:2 | 2,000,000 | 99.30% | [99.14%, 99.46%] | 0.70% | 0.62% |
| 6 mazos S17 DAS 6:5 | 2,000,000 | 98.27% | [98.11%, 98.43%] | 1.73% | 1.79% |
| 1 mazo S17 3:2 | 2,000,000 | 99.85% | [99.69%, 100.01%] | 0.15% | 0.09% |

### Niveles de IA de blackjack (6 mazos S17 DAS 3:2)

| Nivel | Rondas | RTP | IC 95 % |
|---|---:|---:|---|
| Principiante | 500,000 | 94.35% | [94.05%, 94.64%] |
| Intermedio | 500,000 | 96.47% | [96.17%, 96.76%] |
| Avanzado | 2,000,000 | 99.66% | [99.50%, 99.82%] |
| Experto | 500,000 | 99.70% | [99.38%, 100.02%] |

El Experto usa EV dependiente de la composición con todas las cartas vistas desde el barajado (sin ver la carta oculta ni el orden del zapato) y apuesta plano: su ventaja sobre la estrategia básica es pequeña, como se espera en la teoría.

## 4. Juegos adicionales

| Juego / apuesta | RTP simulado | Teórico |
|---|---:|---:|
| Video póker 9/6, estrategia simple (2,000,000 manos) | 98.87% | ≈ 99.46 % (simple) · 99.54 % (óptima) |
| Baccarat Banca (2,000,000 manos) | 98.87% | 98.94 % |
| Baccarat Punto | 98.84% | 98.76 % |
| Baccarat Empate | 85.73% | 85.64 % |
| Baccarat Pareja de Punto | 89.99% | 89.64 % |
| Tres Dados: Chico (2,000,000 tiradas) | 97.31% | 97.22 % (exacto) |
| Tres Dados: Número 4 | 92.15% | 92.13 % (exacto) |
| Tres Dados: Suma 10 | 87.68% | 87.50 % (exacto) |
| Tres Dados: Cualquier triple | 69.24% | 69.44 % (exacto) |
| Tres Dados: Combinación 2-5 | 83.29% | 83.33 % (exacto) |
| Fiesta Pepona, 5 líneas (2,000,000 giros) | 97.17% | 96.57 % (exacto) |
| Keno 1 números (1,000,000 sorteos) | 92.76% | 92.50 % (exacto) |
| Keno 4 números | 92.84% | 92.80 % (exacto) |
| Keno 6 números | 96.78% | 94.14 % (exacto) |
| Keno 10 números | 89.81% | 91.96 % (exacto) |
| Póker de 3 cartas: Ante+Jugar, estrategia Q-6-4 (2,000,000 manos, por unidad de Ante) | 96.73% | 96.63 % (casa 3.37 % del Ante) |
| Póker de 3 cartas: Pair Plus | 92.81% | 92.72 % |
| Mayor o Menor, opción más probable (2,000,000 apuestas) | 96.62% | ≤ 97 % (3 % + redondeo) |

Nota: el keno de 9–10 números y la tragamonedas tienen premios enormes y poco frecuentes (p. ej. 10 de 10 ≈ 1 en 8.9 millones), así que su RTP simulado puede desviarse varios puntos en un millón de rondas aunque el motor sea exacto; la distribución de aciertos del keno se valida por separado con χ² (`tests/unit/games.test.ts` y verificación de 3 M sorteos: RTP 92.0 %).

