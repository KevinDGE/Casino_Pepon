# Simulaciones de probabilidades y RTP

Generado: 2026-11-05T06:24:25.746Z · RNG: crypto.getRandomValues (CryptoRng) · Duración: 17 s

## 1. Póker: frecuencia de manos con 7 cartas (10,000,000 manos)

| Mano | Simulado | Exacto | Diferencia (σ) |
|---|---:|---:|---:|
| Escalera de color | 0.0315% | 0.0311% | 0.71 |
| Póker | 0.1683% | 0.1681% | 0.22 |
| Full | 2.6002% | 2.5961% | 0.81 |
| Color | 3.0268% | 3.0255% | 0.24 |
| Escalera | 4.6199% | 4.6194% | 0.08 |
| Trío | 4.8248% | 4.8299% | -0.74 |
| Doble pareja | 23.4876% | 23.4955% | -0.59 |
| Pareja | 43.8326% | 43.8225% | 0.64 |
| Carta alta | 17.4084% | 17.4119% | -0.30 |

Chi-cuadrada (8 g.l.): 2.35 (valor crítico p=0.01: 20.09) → consistente con las probabilidades exactas.

## 2. Ruleta europea (10,000,000 giros)

Uniformidad de los 37 números: chi-cuadrada = 46.28 (36 g.l., crítico p=0.01: 58.62) → uniforme.

| Apuesta (1 ficha por giro) | RTP simulado | RTP teórico |
|---|---:|---:|
| straight | 97.218% | 97.297% |
| split | 97.099% | 97.297% |
| street | 97.323% | 97.297% |
| corner | 97.097% | 97.297% |
| sixline | 97.268% | 97.297% |
| dozen | 97.275% | 97.297% |
| column | 97.265% | 97.297% |
| red | 97.303% | 97.297% |
| even | 97.319% | 97.297% |
| low | 97.326% | 97.297% |

Todas las apuestas convergen al mismo RTP de 36/37 ≈ 97.30 %: ninguna combinación elimina la ventaja de la casa.

## 3. Blackjack: RTP por reglas (estrategia básica = nivel Avanzado)

| Reglas | Rondas | RTP simulado | IC 95 % | Ventaja casa simulada | Ventaja casa estimada (tabla) |
|---|---:|---:|---|---:|---:|
| 6 mazos S17 DAS 3:2 (por defecto) | 2,000,000 | 99.59% | [99.43%, 99.75%] | 0.41% | 0.40% |
| 6 mazos H17 DAS 3:2 | 2,000,000 | 99.39% | [99.23%, 99.55%] | 0.61% | 0.62% |
| 6 mazos S17 DAS 6:5 | 2,000,000 | 98.21% | [98.05%, 98.37%] | 1.79% | 1.79% |
| 1 mazo S17 3:2 | 2,000,000 | 100.01% | [99.85%, 100.17%] | -0.01% | 0.09% |

### Niveles de IA de blackjack (6 mazos S17 DAS 3:2)

| Nivel | Rondas | RTP | IC 95 % |
|---|---:|---:|---|
| Principiante | 500,000 | 94.62% | [94.32%, 94.91%] |
| Intermedio | 500,000 | 96.48% | [96.18%, 96.78%] |
| Avanzado | 2,000,000 | 99.59% | [99.43%, 99.75%] |
| Experto | 500,000 | 99.80% | [99.48%, 100.12%] |

El Experto usa EV dependiente de la composición con todas las cartas vistas desde el barajado (sin ver la carta oculta ni el orden del zapato) y apuesta plano: su ventaja sobre la estrategia básica es pequeña, como se espera en la teoría.

