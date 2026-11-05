/**
 * Genera src/ai/poker/preflopData.ts: equity de cada una de las 169 clases
 * preflop contra 1, 2 y 4 manos aleatorias (Monte Carlo con semilla fija).
 * Uso: npm run gen:preflop
 */
import { writeFileSync } from 'node:fs';
import { SeededRng, randomInt } from '../src/core/rng';
import { evaluate } from '../src/engine/poker/handEval';
import { COMBO_A, COMBO_B, COMBO_CLASS, NUM_COMBOS } from '../src/ai/poker/combos';

const rng = new SeededRng(20261105);
const SAMPLES = Number(process.env.SAMPLES ?? 60000);

function equity(c1: number, c2: number, opps: number): number {
  let total = 0;
  const dead = new Uint8Array(52);
  const cards = new Array<number>(7);
  const oppHands = new Array<number>(opps * 2);
  for (let s = 0; s < SAMPLES; s++) {
    dead.fill(0);
    dead[c1] = 1; dead[c2] = 1;
    const pick = () => {
      for (;;) {
        const c = randomInt(rng, 52);
        if (!dead[c]) { dead[c] = 1; return c; }
      }
    };
    for (let i = 0; i < opps * 2; i++) oppHands[i] = pick();
    const board = [pick(), pick(), pick(), pick(), pick()];
    cards[0] = c1; cards[1] = c2; for (let i = 0; i < 5; i++) cards[i + 2] = board[i]!;
    const me = evaluate(cards, 7);
    let best = -1, ties = 0;
    for (let o = 0; o < opps; o++) {
      cards[0] = oppHands[o * 2]!; cards[1] = oppHands[o * 2 + 1]!;
      const sc = evaluate(cards, 7);
      if (sc > best) { best = sc; ties = 1; } else if (sc === best) ties++;
    }
    if (me > best) total += 1;
    else if (me === best) total += 1 / (ties + 1);
  }
  return total / SAMPLES;
}

const eq1 = new Array<number>(169).fill(0);
const eq2 = new Array<number>(169).fill(0);
const eq4 = new Array<number>(169).fill(0);
const done = new Set<number>();
for (let i = 0; i < NUM_COMBOS; i++) {
  const k = COMBO_CLASS[i]!;
  if (done.has(k)) continue;
  done.add(k);
  eq1[k] = equity(COMBO_A[i]!, COMBO_B[i]!, 1);
  eq2[k] = equity(COMBO_A[i]!, COMBO_B[i]!, 2);
  eq4[k] = equity(COMBO_A[i]!, COMBO_B[i]!, 4);
}
const fmt = (a: number[]) => `[${a.map((x) => x.toFixed(4)).join(',')}]`;
const out = `// ARCHIVO GENERADO por scripts/gen-preflop.ts (${SAMPLES} simulaciones por clase). No editar a mano.
// Equity de cada clase preflop (índice = classIndex) contra N manos aleatorias.
export const PREFLOP_EQ_1: readonly number[] = ${fmt(eq1)};
export const PREFLOP_EQ_2: readonly number[] = ${fmt(eq2)};
export const PREFLOP_EQ_4: readonly number[] = ${fmt(eq4)};
`;
writeFileSync(new URL('../src/ai/poker/preflopData.ts', import.meta.url), out);
console.log('AA', eq1[12 * 13 + 12], '72o', eq1[0 * 13 + 5], 'AKs', eq1[12 * 13 + 11]);
