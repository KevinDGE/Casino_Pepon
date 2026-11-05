/**
 * Generadores de números aleatorios.
 *
 * - `CryptoRng`: el que usa la app. Toma entropía de `crypto.getRandomValues`
 *   en bloques (para no llamar a la API por cada número) y produce enteros
 *   uniformes SIN sesgo mediante muestreo por rechazo.
 * - `SeededRng`: xoshiro128** determinista. Sólo se usa en pruebas, torneos
 *   y simulaciones reproducibles. Nunca en partidas reales.
 */
export interface Rng {
  /** Entero uniforme de 32 bits sin signo. */
  nextUint32(): number;
}

const BUFFER_SIZE = 1024;

export class CryptoRng implements Rng {
  private buf = new Uint32Array(BUFFER_SIZE);
  private idx = BUFFER_SIZE;

  nextUint32(): number {
    if (this.idx >= BUFFER_SIZE) {
      globalThis.crypto.getRandomValues(this.buf);
      this.idx = 0;
    }
    return this.buf[this.idx++]!;
  }
}

/** xoshiro128** (Blackman & Vigna). Rápido y de buena calidad estadística. */
export class SeededRng implements Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    // splitmix32 para inicializar el estado a partir de una semilla.
    let x = seed >>> 0;
    const next = (): number => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    this.s0 >>>= 0;
    this.s1 >>>= 0;
    this.s2 >>>= 0;
    this.s3 >>>= 0;
    return result;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Entero uniforme en [0, n) sin sesgo de módulo.
 * Rechaza los valores del "sobrante" final del rango de 2^32.
 */
export function randomInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) {
    throw new RangeError(`randomInt: n inválido (${n})`);
  }
  if (n === 1) return 0;
  const limit = 0x100000000 - (0x100000000 % n); // múltiplo exacto de n
  let x: number;
  do {
    x = rng.nextUint32();
  } while (x >= limit);
  return x % n;
}

/** Flotante uniforme en [0, 1) con 53 bits de precisión. */
export function randomFloat(rng: Rng): number {
  const hi = rng.nextUint32() >>> 5; // 27 bits
  const lo = rng.nextUint32() >>> 6; // 26 bits
  return (hi * 67108864 + lo) / 9007199254740992;
}

/** Fisher–Yates (Durstenfeld) en sitio, sin sesgo. */
export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Elige un índice según pesos no negativos. */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return randomInt(rng, weights.length);
  let r = randomFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]!);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Semilla aleatoria criptográfica (para torneos sin semilla explícita). */
export function cryptoSeed(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]!;
}
