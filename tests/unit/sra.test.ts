import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/core/rng';
import { baseDeckHex, decodeCard, decrypt, encrypt, fromHex, generateKey, modPow, shuffleStep, stripStep, SRA_P, toHex } from '../../src/mp/sra';

describe('Póker mental (SRA)', () => {
  const rng = new SeededRng(7);
  it('el primo es seguro (p y (p−1)/2 pasan Fermat en varias bases)', () => {
    const q = (SRA_P - 1n) / 2n;
    for (const a of [2n, 3n, 5n, 7n]) {
      expect(modPow(a, SRA_P - 1n, SRA_P)).toBe(1n);
      expect(modPow(a, q - 1n, q)).toBe(1n);
    }
  });
  it('cifrado conmutativo: las capas se quitan en cualquier orden', () => {
    const a = generateKey(rng), b = generateKey(rng), c = generateKey(rng);
    const m = fromHex(baseDeckHex()[17]!);
    const enc = encrypt(encrypt(encrypt(m, a), b), c);
    expect(decodeCard(decrypt(decrypt(decrypt(enc, b), a), c))).toBe(17);
    expect(decodeCard(decrypt(decrypt(decrypt(enc, c), b), a))).toBe(17);
    expect(decodeCard(decrypt(enc, a))).toBe(-1);
  });
  it('barajar en cadena entre 3 jugadores produce una permutación de las 52 cartas que nadie conoce por separado', () => {
    const keys = [generateKey(rng), generateKey(rng), generateKey(rng)];
    let deck = baseDeckHex();
    for (const k of keys) deck = shuffleStep(deck, k, rng);
    // Ningún valor intermedio se decodifica sin todas las claves.
    expect(deck.every((h) => decodeCard(fromHex(h)) === -1)).toBe(true);
    let plain = deck;
    for (const k of keys) plain = stripStep(plain, k, plain.map(() => true));
    const cards = plain.map((h) => decodeCard(fromHex(h)));
    expect(new Set(cards).size).toBe(52);
    expect(cards.every((c) => c >= 0 && c < 52)).toBe(true);
  });
  it('rechaza valores malformados', () => {
    expect(() => fromHex('zz')).toThrow();
    expect(() => fromHex('1')).toThrow();
    expect(() => fromHex(toHex(SRA_P + 5n))).toThrow();
  });
});
