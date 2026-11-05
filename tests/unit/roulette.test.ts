import { describe, expect, it } from 'vitest';
import {
  WHEEL_ORDER, colorOf, isValidBet, payoutFor, expectedValue, settleBets, insideBetsContaining, outsideNumbers, spin, betKey,
} from '../../src/engine/roulette/roulette';
import { CryptoRng } from '../../src/core/rng';

describe('Ruleta europea', () => {
  it('la rueda tiene 37 casillas únicas y 18 rojos', () => {
    expect(WHEEL_ORDER.length).toBe(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    expect(WHEEL_ORDER.filter((n) => colorOf(n) === 'red').length).toBe(18);
    expect(colorOf(0)).toBe('green');
    // En la rueda europea los colores alternan.
    for (let i = 1; i < 36; i++) expect(colorOf(WHEEL_ORDER[i]!)).not.toBe(colorOf(WHEEL_ORDER[i + 1]!));
  });

  it('pagos estándar', () => {
    expect(payoutFor(1)).toBe(35);
    expect(payoutFor(2)).toBe(17);
    expect(payoutFor(3)).toBe(11);
    expect(payoutFor(4)).toBe(8);
    expect(payoutFor(6)).toBe(5);
    expect(payoutFor(12)).toBe(2);
    expect(payoutFor(18)).toBe(1);
  });

  it('toda apuesta tiene EV de −1/37', () => {
    for (const n of [1, 2, 3, 4, 6, 12, 18]) expect(expectedValue(n)).toBeCloseTo(-1 / 37, 12);
  });

  it('valida apuestas del paño', () => {
    expect(isValidBet('split', [1, 2])).toBe(true);
    expect(isValidBet('split', [3, 4])).toBe(false);
    expect(isValidBet('split', [1, 4])).toBe(true);
    expect(isValidBet('split', [0, 3])).toBe(true);
    expect(isValidBet('split', [0, 4])).toBe(false);
    expect(isValidBet('street', [4, 5, 6])).toBe(true);
    expect(isValidBet('street', [5, 6, 7])).toBe(false);
    expect(isValidBet('corner', [1, 2, 4, 5])).toBe(true);
    expect(isValidBet('corner', [2, 3, 5, 6])).toBe(true);
    expect(isValidBet('corner', [3, 4, 6, 7])).toBe(false);
    expect(isValidBet('sixline', [31, 32, 33, 34, 35, 36])).toBe(true);
    expect(isValidBet('sixline', [34, 35, 36, 37, 38, 39])).toBe(false);
    expect(isValidBet('red', outsideNumbers('red'))).toBe(true);
    expect(isValidBet('dozen', outsideNumbers('dozen', 2))).toBe(true);
    expect(isValidBet('column', outsideNumbers('column', 3))).toBe(true);
    expect(isValidBet('trio', [0, 2, 3])).toBe(true);
    expect(isValidBet('firstfour', [0, 1, 2, 3])).toBe(true);
  });

  it('el selector táctil sólo ofrece apuestas válidas', () => {
    for (let n = 0; n <= 36; n++) {
      const opts = insideBetsContaining(n);
      for (const o of opts) expect(isValidBet(o.kind, o.numbers)).toBe(true);
      expect(new Set(opts.map(betKey)).size).toBe(opts.length);
    }
    // 17: pleno, 4 caballos, 1 transversal, 4 cuadros, 2 seisenas
    expect(insideBetsContaining(17).length).toBe(12);
  });

  it('liquida apuestas correctamente', () => {
    const r = settleBets(
      [
        { kind: 'straight', numbers: [17], amount: 10 },
        { kind: 'red', numbers: outsideNumbers('red'), amount: 10 },
        { kind: 'black', numbers: outsideNumbers('black'), amount: 10 },
      ],
      17,
    );
    expect(r.map((b) => b.net)).toEqual([350, -10, 10]);
    const z = settleBets([{ kind: 'even', numbers: outsideNumbers('even'), amount: 10 }], 0);
    expect(z[0]!.net).toBe(-10); // el cero pierde las apuestas sencillas
  });

  it('el giro es uniforme (chi-cuadrada sobre 370k giros)', () => {
    const rng = new CryptoRng();
    const counts = new Array(37).fill(0);
    const N = 370_000;
    for (let i = 0; i < N; i++) counts[spin(rng)]++;
    const exp = N / 37;
    const chi = counts.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(80);
  });
});
