/**
 * Póker mental con cifrado conmutativo SRA (Shamir–Rivest–Adleman).
 *
 * Todos usan el mismo primo seguro p = 2q + 1 (1024 bits). Cada jugador tiene
 * un exponente secreto e (con inverso d módulo p − 1). Cifrar es m^e mod p y,
 * como (m^a)^b = (m^b)^a, las capas se pueden quitar en cualquier orden.
 * Las cartas se codifican como residuos cuadráticos ((i + 2)^2 mod p) para no
 * filtrar información por el carácter cuadrático del mensaje.
 */
import { type Rng, randomInt } from '../core/rng';

/** Primo seguro de 1024 bits generado con `openssl prime -generate -bits 1024 -safe`. */
export const SRA_P = BigInt(
  '0xDF9D10364DA2FE7D2EBCF5016F16D447D1F68839DD44EC21593C66F9ACEA0B2CEEE90DF4DD33C0900968EF47053D680693D77CE6A3F315AB226204909FBF7D69476A4FD5A5B6F57636DCFFCAD1F7245D24E22BF0FFA9DF38455FBEADC8D8364F39B2B99A63FC1E7059F92D1177DB31C5CE10FC8247F1FFCE11F4476A5F488647',
);
const P_1 = SRA_P - 1n;

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}

function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  let [oldR, r] = [a, b];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  return [oldR, oldS, oldT];
}

export function modInverse(a: bigint, m: bigint): bigint {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error('Sin inverso');
  return ((x % m) + m) % m;
}

function randomBigInt(rng: Rng, bytes: number): bigint {
  let x = 0n;
  for (let i = 0; i < bytes; i += 4) x = (x << 32n) | BigInt(rng.nextUint32());
  return x;
}

export interface SraKey {
  e: bigint;
  d: bigint;
}

export function generateKey(rng: Rng): SraKey {
  for (;;) {
    const e = (randomBigInt(rng, 132) % (P_1 - 3n)) + 3n;
    const [g] = egcd(e, P_1);
    if (g !== 1n) continue;
    return { e, d: modInverse(e, P_1) };
  }
}

export const toHex = (x: bigint): string => x.toString(16);
export const fromHex = (h: string): bigint => {
  if (!/^[0-9a-f]{1,300}$/i.test(h)) throw new Error('Valor inválido');
  const v = BigInt('0x' + h);
  if (v <= 1n || v >= SRA_P) throw new Error('Valor fuera de rango');
  return v;
};

/** Mazo base codificado (todos lo conocen). */
export const BASE_DECK: bigint[] = Array.from({ length: 52 }, (_, i) => modPow(BigInt(i + 2), 2n, SRA_P));
const DECODE = new Map<string, number>(BASE_DECK.map((v, i) => [toHex(v), i]));

/** Carta (0..51) de un valor totalmente descifrado, o −1 si no corresponde a ninguna. */
export function decodeCard(v: bigint): number {
  return DECODE.get(toHex(v)) ?? -1;
}

export const encrypt = (m: bigint, k: SraKey): bigint => modPow(m, k.e, SRA_P);
export const decrypt = (c: bigint, k: Pick<SraKey, 'd'>): bigint => modPow(c, k.d, SRA_P);

/** Paso de barajado: cifra cada carta con la propia clave y permuta (Fisher–Yates). */
export function shuffleStep(input: readonly string[], key: SraKey, rng: Rng): string[] {
  const out = input.map((h) => toHex(encrypt(fromHex(h), key)));
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out;
}

/** Quita la propia capa de las posiciones indicadas (`strip[i]` = true). */
export function stripStep(input: readonly string[], key: Pick<SraKey, 'd'>, strip: readonly boolean[]): string[] {
  return input.map((h, i) => (strip[i] ? toHex(decrypt(fromHex(h), key)) : h));
}

export const baseDeckHex = (): string[] => BASE_DECK.map(toHex);
