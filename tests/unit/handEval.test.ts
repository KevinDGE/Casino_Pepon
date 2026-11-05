import { describe, expect, it } from 'vitest';
import { evaluate, categoryOf, describeScore, bestFive, HandCategory } from '../../src/engine/poker/handEval';
import { cs } from './helpers';
import { cardToString } from '../../src/core/cards';

const ev = (s: string) => evaluate(cs(s));

describe('Evaluador de manos', () => {
  it('identifica cada categoría', () => {
    expect(categoryOf(ev('As Ks Qs Js Ts 2d 3c'))).toBe(HandCategory.StraightFlush);
    expect(describeScore(ev('As Ks Qs Js Ts'))).toBe('Escalera real');
    expect(categoryOf(ev('9h 9d 9s 9c Ah'))).toBe(HandCategory.Quads);
    expect(categoryOf(ev('Kh Kd Ks 3c 3h'))).toBe(HandCategory.FullHouse);
    expect(categoryOf(ev('2h 7h 9h Jh Ah'))).toBe(HandCategory.Flush);
    expect(categoryOf(ev('5c 6d 7h 8s 9c'))).toBe(HandCategory.Straight);
    expect(categoryOf(ev('Qc Qd Qh 2s 9c'))).toBe(HandCategory.Trips);
    expect(categoryOf(ev('Jc Jd 4h 4s 9c'))).toBe(HandCategory.TwoPair);
    expect(categoryOf(ev('Tc Td 4h 3s 9c'))).toBe(HandCategory.Pair);
    expect(categoryOf(ev('Ac Td 4h 3s 9c'))).toBe(HandCategory.HighCard);
  });

  it('rueda A-2-3-4-5 es la escalera más baja', () => {
    const wheel = ev('Ac 2d 3h 4s 5c');
    const six = ev('2d 3h 4s 5c 6d');
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);
    expect(six).toBeGreaterThan(wheel);
    expect(describeScore(wheel)).toBe('Escalera al cinco');
    const steel = ev('Ah 2h 3h 4h 5h');
    expect(categoryOf(steel)).toBe(HandCategory.StraightFlush);
    expect(ev('2h 3h 4h 5h 6h')).toBeGreaterThan(steel);
  });

  it('desempates por kicker', () => {
    expect(ev('Ah Ad Kc 7s 2d')).toBeGreaterThan(ev('Ah Ad Qc Js Td'));
    expect(ev('Ah Ad Kc 7s 3d')).toBeGreaterThan(ev('Ac As Kd 7h 2c'));
    expect(ev('Ah Ad Kc 7s 2d')).toBe(ev('Ac As Kd 7h 2c'));
    expect(ev('Kh Kd 5c 5s Ad')).toBeGreaterThan(ev('Kc Ks 5h 5d Qd'));
    expect(ev('Kh Kd Ks 5s 4d')).toBeGreaterThan(ev('Qh Qd Qs As Kd'));
    expect(ev('Ah 9h 7h 5h 3h')).toBeGreaterThan(ev('Ad 9d 7d 5d 2d'));
  });

  it('con 7 cartas toma la mejor combinación', () => {
    // Tres parejas: cuenta la mejor quinta carta.
    expect(ev('Ah Ad Kh Kd Qh Qd 2c')).toBe(ev('As Ac Ks Kc Qs'));
    // Dos tríos → full con el trío alto.
    expect(describeScore(ev('9h 9d 9s 4c 4h 4d Ac'))).toBe('Full de nueves con cuatros');
    // Color y escalera: gana el color.
    expect(categoryOf(ev('4h 5h 6c 7h 8d 9h Kh'))).toBe(HandCategory.Flush);
    // Póker y full: gana el póker con el mejor kicker.
    expect(ev('8h 8d 8s 8c Kh Kd 2c')).toBe(ev('8h 8d 8s 8c Kc'));
    // Color de 6 cartas: toma las 5 más altas.
    expect(ev('2h 4h 6h 8h Th Qh 3c')).toBe(ev('4h 6h 8h Th Qh'));
  });

  it('bestFive devuelve las 5 cartas que forman la mejor mano', () => {
    const best = bestFive(cs('Ah Kh Qh Jh Th 2c 3d')).map(cardToString).sort();
    expect(best).toEqual(['Ah', 'Jh', 'Kh', 'Qh', 'Th'].sort());
  });

  it('enumera las 2,598,960 manos de 5 cartas con las frecuencias exactas y 7,462 clases', () => {
    const counts = new Array(9).fill(0);
    const distinct = new Set<number>();
    const hand = [0, 0, 0, 0, 0];
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
              const s = evaluate(hand, 5);
              counts[s >> 20]++;
              distinct.add(s);
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
    expect(distinct.size).toBe(7462);
  });
});
