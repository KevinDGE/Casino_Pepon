/**
 * Simulaciones masivas para validar probabilidades y RTP.
 *
 *  npm run sim               → configuración completa (millones de rondas)
 *  npm run sim -- --quick    → muestra pequeña
 *
 * Usa el RNG criptográfico real de la app (CryptoRng) y los mismos motores.
 * Resultados en reports/simulations.md y reports/simulations.json.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CryptoRng, randomInt } from '../src/core/rng';
import { fullDeck } from '../src/core/cards';
import { evaluate } from '../src/engine/poker/handEval';
import { spin, settleBets, outsideNumbers, type RouletteBet } from '../src/engine/roulette/roulette';
import { applyBJAction, createBlackjack, decideInsurance, startRound, seatRoundNet } from '../src/engine/blackjack/game';
import { DEFAULT_RULES, type BlackjackRules } from '../src/engine/blackjack/types';
import { decideBJ, decideInsuranceAI, type BJLevel } from '../src/ai/blackjack/strategy';
import { estimateHouseEdge } from '../src/engine/blackjack/houseEdge';
import { vpDeal, vpDraw, vpSimpleStrategy, maskToHold, VP_PAYTABLE } from '../src/engine/videopoker/videopoker';
import { newBacShoe, playBaccarat, bacReturn } from '../src/engine/baccarat/baccarat';
import { rollDice, diceNet, diceStats, type DiceBet } from '../src/engine/dice/dice';
import { spinSlots, exactSlotsRTP } from '../src/engine/slots/slots';
import { kenoDraw, kenoSettle, kenoRTP } from '../src/engine/keno/keno';
import { tcDeal, tcSettle, tcOptimalPlay } from '../src/engine/threecard/threecard';
import { newHiLo, hiloOdds, hiloPlay } from '../src/engine/hilo/hilo';

type Job =
  | { kind: 'poker7'; n: number }
  | { kind: 'roulette'; n: number }
  | { kind: 'bj'; n: number; level: BJLevel; rules: BlackjackRules; key: string }
  | { kind: 'arcade'; game: string; n: number };

const DICE_BETS: DiceBet[] = [{ kind: 'small', value: [] }, { kind: 'single', value: [4] }, { kind: 'total', value: [10] }, { kind: 'anyTriple', value: [] }, { kind: 'combo', value: [2, 5] }];

function runJob(job: Job): unknown {
  const rng = new CryptoRng();
  switch (job.kind) {
    case 'poker7': {
      const counts = new Array(9).fill(0);
      const deck = fullDeck();
      for (let i = 0; i < job.n; i++) {
        // Fisher-Yates parcial: sólo las primeras 7 posiciones.
        for (let k = 0; k < 7; k++) {
          const j = k + randomInt(rng, 52 - k);
          const t = deck[k]!; deck[k] = deck[j]!; deck[j] = t;
        }
        counts[evaluate(deck, 7) >> 20]++;
      }
      return { counts, n: job.n };
    }
    case 'roulette': {
      const freq = new Array(37).fill(0);
      const bets: RouletteBet[] = [
        { kind: 'straight', numbers: [17], amount: 1 },
        { kind: 'split', numbers: [17, 20], amount: 1 },
        { kind: 'street', numbers: [16, 17, 18], amount: 1 },
        { kind: 'corner', numbers: [17, 18, 20, 21], amount: 1 },
        { kind: 'sixline', numbers: [16, 17, 18, 19, 20, 21], amount: 1 },
        { kind: 'dozen', numbers: outsideNumbers('dozen', 2), amount: 1 },
        { kind: 'column', numbers: outsideNumbers('column', 2), amount: 1 },
        { kind: 'red', numbers: outsideNumbers('red'), amount: 1 },
        { kind: 'even', numbers: outsideNumbers('even'), amount: 1 },
        { kind: 'low', numbers: outsideNumbers('low'), amount: 1 },
      ];
      const returned = new Array(bets.length).fill(0);
      for (let i = 0; i < job.n; i++) {
        const r = spin(rng);
        freq[r]++;
        settleBets(bets, r).forEach((b, k) => (returned[k] += b.returned));
      }
      return { freq, n: job.n, returned, kinds: bets.map((b) => b.kind) };
    }
    case 'arcade': {
      const out: Record<string, number> = { n: job.n };
      const add = (k: string, v: number) => { out[k] = (out[k] ?? 0) + v; };
      switch (job.game) {
        case 'videopoker':
          for (let i = 0; i < job.n; i++) {
            const d = vpDeal(rng, 1);
            const r = vpDraw(d, maskToHold(vpSimpleStrategy(d.hand)));
            add('ret', VP_PAYTABLE[r.result!]);
          }
          break;
        case 'baccarat': {
          const shoe = newBacShoe(rng);
          for (let i = 0; i < job.n; i++) {
            const r = playBaccarat(shoe, rng);
            add('banker', bacReturn('banker', 1, r)); add('player', bacReturn('player', 1, r)); add('tie', bacReturn('tie', 1, r)); add('pair', bacReturn('playerPair', 1, r));
          }
          break;
        }
        case 'dados':
          for (let i = 0; i < job.n; i++) {
            const r = rollDice(rng);
            DICE_BETS.forEach((b, k) => add(`b${k}`, diceNet(b, r) + 1));
          }
          break;
        case 'tragamonedas':
          for (let i = 0; i < job.n; i++) add('ret', spinSlots(rng).totalPay / 5);
          break;
        case 'keno':
          for (let i = 0; i < job.n; i++) {
            const d = kenoDraw(rng);
            for (const spots of [1, 4, 6, 10]) add(`k${spots}`, kenoSettle(Array.from({ length: spots }, (_, j) => j + 1), d, 1).returned);
          }
          break;
        case 'trescartas':
          for (let i = 0; i < job.n; i++) {
            const r = tcDeal(rng, 1, 1);
            const playIt = tcOptimalPlay(r.player);
            const res = tcSettle(r, playIt);
            add('anteNet', res.anteNet + res.playNet + res.bonusNet);
            add('ppNet', res.pairPlusNet);
          }
          break;
        case 'mayormenor': {
          let st = newHiLo(rng);
          for (let i = 0; i < job.n; i++) {
            const o = hiloOdds(st);
            const g = o.higher >= o.lower ? 'higher' : 'lower';
            const r = hiloPlay(st, g, rng);
            add('ret', r.won ? r.multiplier : 0);
            st = r.state;
          }
          break;
        }
      }
      return out;
    }
    case 'bj': {
      const t = createBlackjack(job.rules, [{ id: 'p', name: 'p', isHuman: false, bankroll: 1e15 }], rng);
      let net = 0, wagered = 0, sumSq = 0;
      for (let i = 0; i < job.n; i++) {
        startRound(t, [1000], rng);
        if (t.phase === 'insurance') decideInsurance(t, 0, decideInsuranceAI(job.level, t, 0));
        while (t.phase === 'playing') applyBJAction(t, decideBJ(job.level, t));
        const x = seatRoundNet(t.seats[0]!) / 1000;
        net += x;
        sumSq += x * x;
        wagered += 1;
      }
      return { n: job.n, net, sumSq, wagered };
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ja = args.indexOf('--job');
  if (ja >= 0) {
    process.stdout.write(JSON.stringify(runJob(JSON.parse(args[ja + 1]!) as Job)));
    return;
  }
  const quick = args.includes('--quick');
  const M = quick ? 0.05 : 1;
  const jobs: { job: Job; key: string }[] = [];
  const chunks = 4;
  for (let c = 0; c < chunks; c++) jobs.push({ key: 'poker7', job: { kind: 'poker7', n: Math.round(2_500_000 * M) } });
  for (let c = 0; c < chunks; c++) jobs.push({ key: 'roulette', job: { kind: 'roulette', n: Math.round(2_500_000 * M) } });
  const ruleSets: { key: string; rules: BlackjackRules }[] = [
    { key: '6 mazos S17 DAS 3:2 (por defecto)', rules: { ...DEFAULT_RULES } },
    { key: '6 mazos H17 DAS 3:2', rules: { ...DEFAULT_RULES, dealerHitsSoft17: true } },
    { key: '6 mazos S17 DAS 6:5', rules: { ...DEFAULT_RULES, blackjackPays: '6:5' } },
    { key: '1 mazo S17 3:2', rules: { ...DEFAULT_RULES, decks: 1, doubleAfterSplit: false } },
  ];
  for (const rs of ruleSets) {
    for (let c = 0; c < chunks; c++) jobs.push({ key: `bj|advanced|${rs.key}`, job: { kind: 'bj', n: Math.round(500_000 * M), level: 'advanced', rules: rs.rules, key: rs.key } });
  }
  for (const lv of ['beginner', 'intermediate', 'expert'] as BJLevel[]) {
    for (let c = 0; c < 2; c++) jobs.push({ key: `bj|${lv}|${ruleSets[0]!.key}`, job: { kind: 'bj', n: Math.round(250_000 * M), level: lv, rules: ruleSets[0]!.rules, key: ruleSets[0]!.key } });
  }
  const ARCADE: [string, number][] = [['videopoker', 2_000_000], ['baccarat', 2_000_000], ['dados', 2_000_000], ['tragamonedas', 2_000_000], ['keno', 1_000_000], ['trescartas', 2_000_000], ['mayormenor', 2_000_000]];
  for (const [g, n] of ARCADE) for (let c = 0; c < chunks; c++) jobs.push({ key: `arcade|${g}`, job: { kind: 'arcade', game: g, n: Math.round((n / chunks) * M) } });
  const self = fileURLToPath(import.meta.url);
  const results = new Map<string, unknown[]>();
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: cpus().length }, async () => {
    while (next < jobs.length) {
      const { job, key } = jobs[next++]!;
      const out = await new Promise<string>((resolve, reject) => {
        const ch = spawn(process.execPath, ['--import', 'tsx', self, '--job', JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'inherit'] });
        let buf = '';
        ch.stdout.on('data', (d) => (buf += d));
        ch.on('exit', (code) => (code === 0 ? resolve(buf) : reject(new Error(`falló ${key}`))));
      });
      const arr = results.get(key) ?? [];
      arr.push(JSON.parse(out));
      results.set(key, arr);
      console.log(`[${++done}/${jobs.length}] ${key} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }));

  const lines: string[] = ['# Simulaciones de probabilidades y RTP', '', `Generado: ${new Date().toISOString()} · RNG: crypto.getRandomValues (CryptoRng) · Duración: ${((Date.now() - t0) / 1000).toFixed(0)} s`, ''];
  const json: Record<string, unknown> = {};

  // Póker
  const p7 = results.get('poker7') as { counts: number[]; n: number }[];
  const counts = p7.reduce((a, r) => a.map((x, i) => x + r.counts[i]!), new Array(9).fill(0) as number[]);
  const N7 = p7.reduce((a, r) => a + r.n, 0);
  const exact = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584].map((x) => x / 133784560);
  const names = ['Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color'];
  lines.push(`## 1. Póker: frecuencia de manos con 7 cartas (${N7.toLocaleString('es-MX')} manos)`, '');
  lines.push('| Mano | Simulado | Exacto | Diferencia (σ) |', '|---|---:|---:|---:|');
  let chi = 0;
  for (let i = 8; i >= 0; i--) {
    const p = counts[i]! / N7;
    const e = exact[i]!;
    const sigma = Math.sqrt((e * (1 - e)) / N7);
    chi += (counts[i]! - e * N7) ** 2 / (e * N7);
    lines.push(`| ${names[i]} | ${(p * 100).toFixed(4)}% | ${(e * 100).toFixed(4)}% | ${((p - e) / sigma).toFixed(2)} |`);
  }
  lines.push('', `Chi-cuadrada (8 g.l.): ${chi.toFixed(2)} (valor crítico p=0.01: 20.09) → ${chi < 20.09 ? 'consistente con las probabilidades exactas' : 'REVISAR'}.`, '');
  json.poker7 = { n: N7, counts, chi };

  // Ruleta
  const rr = results.get('roulette') as { freq: number[]; n: number; returned: number[]; kinds: string[] }[];
  const NR = rr.reduce((a, r) => a + r.n, 0);
  const freq = rr.reduce((a, r) => a.map((x, i) => x + r.freq[i]!), new Array(37).fill(0) as number[]);
  const ret = rr.reduce((a, r) => a.map((x, i) => x + r.returned[i]!), new Array(rr[0]!.returned.length).fill(0) as number[]);
  const chiR = freq.reduce((s, o) => s + (o - NR / 37) ** 2 / (NR / 37), 0);
  lines.push(`## 2. Ruleta europea (${NR.toLocaleString('es-MX')} giros)`, '');
  lines.push(`Uniformidad de los 37 números: chi-cuadrada = ${chiR.toFixed(2)} (36 g.l., crítico p=0.01: 58.62) → ${chiR < 58.62 ? 'uniforme' : 'REVISAR'}.`, '');
  lines.push('| Apuesta (1 ficha por giro) | RTP simulado | RTP teórico |', '|---|---:|---:|');
  rr[0]!.kinds.forEach((k, i) => lines.push(`| ${k} | ${((ret[i]! / NR) * 100).toFixed(3)}% | 97.297% |`));
  lines.push('', 'Todas las apuestas convergen al mismo RTP de 36/37 ≈ 97.30 %: ninguna combinación elimina la ventaja de la casa.', '');
  json.roulette = { n: NR, chi: chiR, rtp: ret.map((x) => x / NR) };

  // Blackjack
  lines.push('## 3. Blackjack: RTP por reglas (estrategia básica = nivel Avanzado)', '');
  lines.push('| Reglas | Rondas | RTP simulado | IC 95 % | Ventaja casa simulada | Ventaja casa estimada (tabla) |', '|---|---:|---:|---|---:|---:|');
  const bj: Record<string, unknown> = {};
  for (const [key, arr] of results) {
    if (!key.startsWith('bj|')) continue;
    const [, level, rk] = key.split('|');
    const a = arr as { n: number; net: number; sumSq: number }[];
    const n = a.reduce((x, r) => x + r.n, 0);
    const net = a.reduce((x, r) => x + r.net, 0);
    const sq = a.reduce((x, r) => x + r.sumSq, 0);
    const mean = net / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    const se = sd / Math.sqrt(n);
    bj[key] = { n, rtp: 1 + mean, se };
    if (level === 'advanced') {
      const rules = ruleSets.find((r) => r.key === rk)!.rules;
      lines.push(`| ${rk} | ${n.toLocaleString('es-MX')} | ${((1 + mean) * 100).toFixed(2)}% | [${((1 + mean - 1.96 * se) * 100).toFixed(2)}%, ${((1 + mean + 1.96 * se) * 100).toFixed(2)}%] | ${(-mean * 100).toFixed(2)}% | ${(estimateHouseEdge(rules) * 100).toFixed(2)}% |`);
    }
  }
  lines.push('', '### Niveles de IA de blackjack (6 mazos S17 DAS 3:2)', '', '| Nivel | Rondas | RTP | IC 95 % |', '|---|---:|---:|---|');
  for (const lv of ['beginner', 'intermediate', 'advanced', 'expert']) {
    const r = bj[`bj|${lv}|${ruleSets[0]!.key}`] as { n: number; rtp: number; se: number } | undefined;
    if (r) lines.push(`| ${({ beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', expert: 'Experto' } as Record<string, string>)[lv]} | ${r.n.toLocaleString('es-MX')} | ${(r.rtp * 100).toFixed(2)}% | [${((r.rtp - 1.96 * r.se) * 100).toFixed(2)}%, ${((r.rtp + 1.96 * r.se) * 100).toFixed(2)}%] |`);
  }
  lines.push('', 'El Experto usa EV dependiente de la composición con todas las cartas vistas desde el barajado (sin ver la carta oculta ni el orden del zapato) y apuesta plano: su ventaja sobre la estrategia básica es pequeña, como se espera en la teoría.', '');
  json.blackjack = bj;

  // Juegos adicionales
  const agg = (g: string) => (results.get(`arcade|${g}`) as Record<string, number>[]).reduce((a, r) => { for (const [k, v] of Object.entries(r)) a[k] = (a[k] ?? 0) + v; return a; }, {} as Record<string, number>);
  const row = (name: string, sim: number, theo: string) => `| ${name} | ${(sim * 100).toFixed(2)}% | ${theo} |`;
  lines.push('## 4. Juegos adicionales', '', '| Juego / apuesta | RTP simulado | Teórico |', '|---|---:|---:|');
  const vp = agg('videopoker');
  lines.push(row(`Video póker 9/6, estrategia simple (${vp.n!.toLocaleString('es-MX')} manos)`, vp.ret! / vp.n!, '≈ 99.46 % (simple) · 99.54 % (óptima)'));
  const bc = agg('baccarat');
  lines.push(row(`Baccarat Banca (${bc.n!.toLocaleString('es-MX')} manos)`, bc.banker! / bc.n!, '98.94 %'));
  lines.push(row('Baccarat Punto', bc.player! / bc.n!, '98.76 %'));
  lines.push(row('Baccarat Empate', bc.tie! / bc.n!, '85.64 %'));
  lines.push(row('Baccarat Pareja de Punto', bc.pair! / bc.n!, '89.64 %'));
  const dc = agg('dados');
  const diceNames = ['Chico', 'Número 4', 'Suma 10', 'Cualquier triple', 'Combinación 2-5'];
  DICE_BETS.forEach((b, k) => lines.push(row(`Tres Dados: ${diceNames[k]}${k === 0 ? ` (${dc.n!.toLocaleString('es-MX')} tiradas)` : ''}`, dc[`b${k}`]! / dc.n!, `${((1 + diceStats(b).ev) * 100).toFixed(2)} % (exacto)`)));
  const sl = agg('tragamonedas');
  lines.push(row(`Fiesta Pepona, 5 líneas (${sl.n!.toLocaleString('es-MX')} giros)`, sl.ret! / sl.n!, `${(exactSlotsRTP(5).rtp * 100).toFixed(2)} % (exacto)`));
  const kn = agg('keno');
  for (const spots of [1, 4, 6, 10]) lines.push(row(`Keno ${spots} números${spots === 1 ? ` (${kn.n!.toLocaleString('es-MX')} sorteos)` : ''}`, kn[`k${spots}`]! / kn.n!, `${(kenoRTP(spots) * 100).toFixed(2)} % (exacto)`));
  const tc = agg('trescartas');
  lines.push(row(`Póker de 3 cartas: Ante+Jugar, estrategia Q-6-4 (${tc.n!.toLocaleString('es-MX')} manos, por unidad de Ante)`, 1 + tc.anteNet! / tc.n!, '96.63 % (casa 3.37 % del Ante)'));
  lines.push(row('Póker de 3 cartas: Pair Plus', 1 + tc.ppNet! / tc.n!, '92.72 %'));
  const hl = agg('mayormenor');
  lines.push(row(`Mayor o Menor, opción más probable (${hl.n!.toLocaleString('es-MX')} apuestas)`, hl.ret! / hl.n!, '≤ 97 % (3 % + redondeo)'));
  lines.push('', 'Nota: el keno de 9–10 números y la tragamonedas tienen premios enormes y poco frecuentes (p. ej. 10 de 10 ≈ 1 en 8.9 millones), así que su RTP simulado puede desviarse varios puntos en un millón de rondas aunque el motor sea exacto; la distribución de aciertos del keno se valida por separado con χ² (`tests/unit/games.test.ts` y verificación de 3 M sorteos: RTP 92.0 %).', '');
  json.arcade = { vp, bc, dc, sl, kn, tc, hl };
  const md = lines.join('\n') + '\n';
  mkdirSync(new URL('../reports', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../reports/simulations${quick ? '-quick' : ''}.md`, import.meta.url), md);
  writeFileSync(new URL(`../reports/simulations${quick ? '-quick' : ''}.json`, import.meta.url), JSON.stringify(json, null, 2));
  console.log('\n' + md);
}

main().catch((e) => { console.error(e); process.exit(1); });
