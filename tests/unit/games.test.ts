import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/core/rng';
import { cs } from './helpers';
import { fullDeck } from '../../src/core/cards';
import {
  classifyVP, vpDeal, vpDraw, vpHoldEVs, bestHold, vpSimpleStrategy, maskToHold, VP_PAYTABLE,
} from '../../src/engine/videopoker/videopoker';
import { bankerDraws, bacTotal, bacReturn, playBaccarat, newBacShoe, type BacRound } from '../../src/engine/baccarat/baccarat';
import { diceNet, diceStats, TOTAL_PAYS, rollDice, type DiceBet } from '../../src/engine/dice/dice';
import { exactSlotsRTP, evaluateStops, linePay, REELS, spinSlots, symbolOdds } from '../../src/engine/slots/slots';
import { KENO_PAYS, kenoDraw, kenoProb, kenoRTP, kenoSettle } from '../../src/engine/keno/keno';
import { tcScore, dealerQualifies, tcSettle, tcPlayEV, tcOptimalPlay, tcDeal } from '../../src/engine/threecard/threecard';
import { hiloMultiplier, hiloOdds, hiloPlay, newHiLo } from '../../src/engine/hilo/hilo';

describe('Video póker: Jotas o mejor 9/6', () => {
  it('clasifica las manos', () => {
    expect(classifyVP(cs('As Ks Qs Js Ts'))).toBe('royal');
    expect(classifyVP(cs('9h 8h 7h 6h 5h'))).toBe('straightFlush');
    expect(classifyVP(cs('9h 9d 9s 9c 2h'))).toBe('quads');
    expect(classifyVP(cs('9h 9d 9s 2c 2h'))).toBe('fullHouse');
    expect(classifyVP(cs('2h 7h 9h Jh Ah'))).toBe('flush');
    expect(classifyVP(cs('Ah 2d 3s 4c 5h'))).toBe('straight');
    expect(classifyVP(cs('4h 4d 4s Kc 2h'))).toBe('trips');
    expect(classifyVP(cs('4h 4d Ks Kc 2h'))).toBe('twoPair');
    expect(classifyVP(cs('Jh Jd 4s 7c 2h'))).toBe('jacksOrBetter');
    expect(classifyVP(cs('Th Td 4s 7c 2h'))).toBe('nothing');
  });
  it('cambia sólo las cartas no conservadas con las siguientes del mazo', () => {
    const deck = [...cs('As Ks 2d 3c 9h 7s 8s'), ...fullDeck().filter((c) => !cs('As Ks 2d 3c 9h 7s 8s').includes(c))];
    const s = vpDeal(new SeededRng(1), 5, deck);
    const d = vpDraw(s, [true, true, false, false, true]);
    expect(d.hand).toEqual(cs('As Ks 7s 8s 9h'));
    expect(d.payout).toBe(5 * VP_PAYTABLE[d.result!]);
  });
  it('EV exacto coincide con valores publicados (pareja alta 1.5365, pareja baja 0.8237)', () => {
    expect(vpHoldEVs(cs('Js Jh 2c 5d 8h'))[3]).toBeCloseTo(1.5365, 3);
    const low = vpHoldEVs(cs('5s 5h 2c 9d Kh'));
    expect(low[3]).toBeCloseTo(0.8237, 3);
    expect(bestHold(low).mask).toBe(3);
    const royal = vpHoldEVs(cs('As Ks Qs Js Ts'));
    expect(bestHold(royal)).toEqual({ mask: 31, ev: 800 });
  });
  it('la estrategia simple elige lo mismo que el óptimo en manos clave', () => {
    expect(vpSimpleStrategy(cs('Ah Kh Qh Jh 2c'))).toBe(15); // 4 a escalera real
    expect(vpSimpleStrategy(cs('Jh Jd 4s 7c 2h'))).toBe(3); // pareja alta
    expect(vpSimpleStrategy(cs('Kh Qh 8s 4c 2d'))).toBe(3); // 2 altas del mismo palo
    expect(vpSimpleStrategy(cs('2h 7d 9s 4c 3d'))).toBe(0); // descartar todo
    const r = new SeededRng(9);
    let loss = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const h = vpDeal(r, 1).hand;
      const evs = vpHoldEVs(h);
      loss += bestHold(evs).ev - evs[vpSimpleStrategy(h)]!;
    }
    expect(loss / N).toBeLessThan(0.03);
  });
  it('máscara a cartas conservadas', () => {
    expect(maskToHold(5)).toEqual([true, false, true, false, false]);
  });
});

describe('Baccarat', () => {
  it('valores y totales', () => {
    expect(bacTotal(cs('Kd 9c'))).toBe(9);
    expect(bacTotal(cs('7d 8c'))).toBe(5);
    expect(bacTotal(cs('Ad Tc Qh'))).toBe(1);
  });
  it('tabla de tercera carta de la banca', () => {
    expect(bankerDraws(5, null)).toBe(true);
    expect(bankerDraws(6, null)).toBe(false);
    expect(bankerDraws(3, 8)).toBe(false);
    expect(bankerDraws(3, 9)).toBe(true);
    expect(bankerDraws(4, 1)).toBe(false);
    expect(bankerDraws(4, 2)).toBe(true);
    expect(bankerDraws(5, 4)).toBe(true);
    expect(bankerDraws(5, 3)).toBe(false);
    expect(bankerDraws(6, 6)).toBe(true);
    expect(bankerDraws(6, 5)).toBe(false);
    expect(bankerDraws(7, 6)).toBe(false);
    expect(bankerDraws(2, 0)).toBe(true);
  });
  it('pagos: banca 0.95:1, empate devuelve punto/banca, pareja 11:1', () => {
    const r: BacRound = { player: [], banker: [], playerTotal: 5, bankerTotal: 7, winner: 'banker', natural: false, playerPair: true, bankerPair: false };
    expect(bacReturn('banker', 100, r)).toBe(195);
    expect(bacReturn('player', 100, r)).toBe(0);
    expect(bacReturn('playerPair', 100, r)).toBe(1200);
    const t = { ...r, winner: 'tie' as const };
    expect(bacReturn('player', 100, t)).toBe(100);
    expect(bacReturn('tie', 100, t)).toBe(900);
  });
  it('ventaja de la casa simulada cerca de la teórica (300,000 manos)', () => {
    const rng = new SeededRng(4);
    const shoe = newBacShoe(rng);
    let b = 0, p = 0, t = 0;
    const N = 300_000;
    for (let i = 0; i < N; i++) {
      const r = playBaccarat(shoe, rng);
      expect(r.player.length).toBeGreaterThanOrEqual(2);
      b += bacReturn('banker', 1, r) - 1;
      p += bacReturn('player', 1, r) - 1;
      t += bacReturn('tie', 1, r) - 1;
    }
    expect(-b / N).toBeGreaterThan(0.0);
    expect(-b / N).toBeLessThan(0.025);
    expect(-p / N).toBeGreaterThan(0.0);
    expect(-p / N).toBeLessThan(0.03);
    expect(-t / N).toBeGreaterThan(0.09);
  });
});

describe('Tres Dados', () => {
  const bet = (kind: DiceBet['kind'], ...value: number[]): DiceBet => ({ kind, value });
  it('pagos y triples', () => {
    expect(diceNet(bet('small'), [1, 2, 3])).toBe(1);
    expect(diceNet(bet('small'), [2, 2, 2])).toBe(-1);
    expect(diceNet(bet('big'), [6, 5, 1])).toBe(1);
    expect(diceNet(bet('total', 4), [1, 1, 2])).toBe(TOTAL_PAYS[4]);
    expect(diceNet(bet('single', 5), [5, 5, 2])).toBe(2);
    expect(diceNet(bet('triple', 3), [3, 3, 3])).toBe(150);
    expect(diceNet(bet('combo', 1, 6), [6, 2, 1])).toBe(5);
    expect(diceNet(bet('double', 4), [4, 1, 4])).toBe(8);
  });
  it('EV exacto: chico/grande −2.78 %, número único −7.87 %, todas negativas', () => {
    expect(diceStats(bet('small')).ev).toBeCloseTo(-6 / 216 * 1, 4);
    expect(diceStats(bet('single', 3)).ev).toBeCloseTo(-17 / 216, 4);
    const all: DiceBet[] = [bet('odd'), bet('even'), bet('anyTriple'), ...[1, 2, 3, 4, 5, 6].flatMap((n) => [bet('triple', n), bet('double', n), bet('single', n)]), ...Object.keys(TOTAL_PAYS).map((t) => bet('total', Number(t))), bet('combo', 2, 5)];
    for (const b of all) expect(diceStats(b).ev).toBeLessThan(0);
  });
  it('dados uniformes', () => {
    const r = new SeededRng(3);
    const c = new Array(7).fill(0);
    for (let i = 0; i < 60_000; i++) for (const d of rollDice(r)) c[d]++;
    for (let f = 1; f <= 6; f++) expect(c[f] / 180_000).toBeCloseTo(1 / 6, 2);
  });
});

describe('Tragamonedas', () => {
  it('líneas con comodín y cerezas', () => {
    expect(linePay('siete', 'siete', 'siete')).toBe(100);
    expect(linePay('siete', 'pepon', 'siete')).toBe(100);
    expect(linePay('pepon', 'pepon', 'pepon')).toBe(500);
    expect(linePay('cereza', 'cereza', 'campana')).toBe(3);
    expect(linePay('cereza', 'campana', 'campana')).toBe(0);
    expect(linePay('siete', 'corona', 'siete')).toBe(0);
  });
  it('RTP exacto entre 95 % y 97 % y frecuencia de aciertos razonable', () => {
    const { rtp, hitRate, combos } = exactSlotsRTP();
    expect(combos).toBe(REELS.reduce((a, r) => a * r.length, 1));
    expect(rtp).toBeGreaterThan(0.95);
    expect(rtp).toBeLessThan(0.97);
    expect(hitRate).toBeGreaterThan(0.2);
    expect(symbolOdds().find((o) => o.symbol === 'pepon')!.prob).toBeCloseTo(1 / 27000, 8);
  });
  it('la simulación converge al RTP exacto', () => {
    const r = new SeededRng(12);
    let pay = 0;
    const N = 400_000;
    for (let i = 0; i < N; i++) pay += spinSlots(r).totalPay;
    expect(pay / (N * 5)).toBeCloseTo(exactSlotsRTP().rtp, 1);
  });
  it('la ventana visible es la tira real del carrete', () => {
    const res = evaluateStops([0, 0, 0]);
    expect(res.grid[0]![1]).toBe(REELS[0]![0]);
    expect(res.grid[0]![0]).toBe(REELS[0]![REELS[0]!.length - 1]);
  });
});

describe('Keno', () => {
  it('las probabilidades suman 1 y el RTP está entre 90 % y 96 %', () => {
    for (let n = 1; n <= 10; n++) {
      let s = 0;
      for (let k = 0; k <= n; k++) s += kenoProb(n, k);
      expect(s).toBeCloseTo(1, 10);
      expect(kenoRTP(n)).toBeGreaterThan(0.9);
      expect(kenoRTP(n)).toBeLessThan(0.96);
      expect(KENO_PAYS[n]!.length).toBe(n + 1);
    }
  });
  it('sorteo de 20 números distintos y liquidación', () => {
    const d = kenoDraw(new SeededRng(5));
    expect(new Set(d).size).toBe(20);
    expect(d.every((x) => x >= 1 && x <= 80)).toBe(true);
    const s = kenoSettle([d[0]!, d[1]!], d, 10);
    expect(s.hits).toBe(2);
    expect(s.returned).toBe(10 * KENO_PAYS[2]![2]!);
  });
});

describe('Póker de 3 cartas', () => {
  it('ranking: escalera supera al color y A-2-3 es escalera', () => {
    expect(tcScore(cs('5h 6d 7c')).hand).toBe('straight');
    expect(tcScore(cs('Ah 2d 3c')).hand).toBe('straight');
    expect(tcScore(cs('2h 7h Kh')).hand).toBe('flush');
    expect(tcScore(cs('5h 6d 7c')).score).toBeGreaterThan(tcScore(cs('2h 7h Kh')).score);
    expect(tcScore(cs('Ah 2d 3c')).score).toBeLessThan(tcScore(cs('2h 3d 4c')).score);
    expect(tcScore(cs('Qh Kd Ac')).score).toBeGreaterThan(tcScore(cs('Jh Qd Kc')).score);
    expect(tcScore(cs('9h 9d 9c')).hand).toBe('trips');
  });
  it('el crupier califica con dama alta', () => {
    expect(dealerQualifies(cs('Qh 4d 2c'))).toBe(true);
    expect(dealerQualifies(cs('Jh 9d 2c'))).toBe(false);
    expect(dealerQualifies(cs('2h 2d 3c'))).toBe(true);
  });
  it('liquidación: no califica paga Ante y empata Jugar; retirarse pierde Ante', () => {
    const deck = [...cs('Ah Kd 5c Jh 9d 2c'), ...fullDeck().filter((c) => !cs('Ah Kd 5c Jh 9d 2c').includes(c))];
    const r = tcDeal(new SeededRng(1), 10, 0, deck);
    const res = tcSettle(r, true);
    expect(res.outcome).toBe('noQualify');
    expect(res.net).toBe(10);
    expect(tcSettle(r, false).net).toBe(-10);
  });
  it('EV exacto: Q-6-4 es la frontera de la estrategia óptima', () => {
    expect(tcPlayEV(cs('Qh 6d 4c')).play).toBeGreaterThan(-1);
    expect(tcPlayEV(cs('Qh 6d 3c')).play).toBeLessThan(-1);
    expect(tcOptimalPlay(cs('Qh 6d 4c'))).toBe(true);
    expect(tcOptimalPlay(cs('Qh 6d 3c'))).toBe(false);
    expect(tcOptimalPlay(cs('2h 2d 7c'))).toBe(true);
  });
});

describe('Mayor o Menor', () => {
  it('probabilidades con las cartas restantes y pagos con 3 % de ventaja', () => {
    const s = newHiLo(new SeededRng(2));
    const o = hiloOdds(s);
    expect(o.higher + o.lower + o.equal).toBeCloseTo(1, 10);
    expect(o.equal).toBeCloseTo(3 / 51, 10);
    expect(hiloMultiplier(0.5)).toBe(1.94);
    expect(hiloMultiplier(0)).toBe(0);
  });
  it('EV de cada apuesta ≤ −3 % (por redondeo hacia abajo) y rebarajado conserva la carta', () => {
    const r = new SeededRng(8);
    let s = newHiLo(r);
    let ret = 0, n = 0;
    for (let i = 0; i < 20_000; i++) {
      const o = hiloOdds(s);
      const g = o.higher >= o.lower ? 'higher' : 'lower';
      for (const k of ['higher', 'lower', 'equal'] as const) {
        if (o[k] > 0) expect(o[k] * hiloMultiplier(o[k])).toBeLessThanOrEqual(0.97 + 1e-9);
      }
      const res = hiloPlay(s, g, r);
      ret += res.won ? res.multiplier : 0;
      n++;
      if (res.reshuffled) expect(res.state.current).toBe(res.next);
      s = res.state;
    }
    expect(ret / n).toBeLessThan(0.98);
    expect(ret / n).toBeGreaterThan(0.94);
  });
});
