import { describe, expect, it } from 'vitest';
import { CryptoRng, SeededRng, randomInt, randomFloat, shuffleInPlace, weightedIndex } from '../../src/core/rng';
import { fullDeck } from '../../src/core/cards';

describe('RNG', () => {
  it('CryptoRng produce enteros de 32 bits', () => {
    const r = new CryptoRng();
    for (let i = 0; i < 5000; i++) {
      const x = r.nextUint32();
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2 ** 32);
    }
  });

  it('SeededRng es determinista', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32());
    expect(new SeededRng(1).nextUint32()).not.toBe(new SeededRng(2).nextUint32());
  });

  it('randomInt es uniforme (chi-cuadrada, n=37, 370k muestras)', () => {
    const r = new CryptoRng();
    const n = 37;
    const N = 370_000;
    const counts = new Array(n).fill(0);
    for (let i = 0; i < N; i++) counts[randomInt(r, n)]++;
    const exp = N / n;
    const chi = counts.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
    // gl = 36; p=0.0001 → ~ 75. Muy holgado para no tener falsos positivos.
    expect(chi).toBeLessThan(80);
  });

  it('randomInt rechaza n inválidos', () => {
    const r = new SeededRng(1);
    expect(() => randomInt(r, 0)).toThrow();
    expect(() => randomInt(r, 1.5)).toThrow();
    expect(randomInt(r, 1)).toBe(0);
  });

  it('randomFloat está en [0,1) con media ~0.5', () => {
    const r = new CryptoRng();
    let s = 0;
    for (let i = 0; i < 100_000; i++) {
      const f = randomFloat(r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      s += f;
    }
    expect(Math.abs(s / 100_000 - 0.5)).toBeLessThan(0.01);
  });

  it('Fisher-Yates genera las 24 permutaciones de 4 elementos de forma uniforme', () => {
    const r = new CryptoRng();
    const N = 240_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const k = shuffleInPlace([0, 1, 2, 3], r).join('');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    const exp = N / 24;
    let chi = 0;
    for (const v of counts.values()) chi += (v - exp) ** 2 / exp;
    // gl = 23; p=0.0001 → ~ 56.
    expect(chi).toBeLessThan(60);
  });

  it('Fisher-Yates: cada carta aparece en cada posición con la misma frecuencia', () => {
    const r = new SeededRng(7);
    const N = 52_000;
    const pos0 = new Array(52).fill(0);
    for (let i = 0; i < N; i++) pos0[shuffleInPlace(fullDeck(), r)[0]!]++;
    const exp = N / 52;
    const chi = pos0.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(100); // gl = 51; p=0.0001 → ~ 96
    const d = shuffleInPlace(fullDeck(), r);
    expect(new Set(d).size).toBe(52);
  });

  it('weightedIndex respeta los pesos', () => {
    const r = new SeededRng(3);
    const counts = [0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[weightedIndex(r, [1, 2, 3])]!++;
    expect(counts[0]! / 60_000).toBeCloseTo(1 / 6, 1);
    expect(counts[2]! / 60_000).toBeCloseTo(1 / 2, 1);
  });
});
