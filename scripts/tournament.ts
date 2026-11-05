/**
 * Torneos automáticos entre niveles de IA de póker.
 *
 *  npm run tournament                 → configuración completa (varios minutos)
 *  npm run tournament -- --quick      → muestra pequeña
 *
 * Formatos:
 *  1. Mano a mano DUPLICADO (cash, 100 BB, stacks reiniciados): cada mazo se juega
 *     dos veces intercambiando las cartas entre los bots. Resultado en bb/100 con IC 95 %.
 *  2. Mesa de 6 jugadores mixta con rotación de asientos.
 *  3. Freezeouts mano a mano (50 BB, ciegas que suben) — porcentaje de victorias.
 *
 * Los procesos hijos se ejecutan en paralelo (uno por núcleo).
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  duplicateHeadsUpRaw, freezeout, mergeRaw, rawToResult, ringGame, type BotSpec, type RawStats,
} from '../src/ai/poker/match';
import { LEVEL_NAMES_ES, type PokerLevel } from '../src/ai/poker/bots';
import { rivalById } from '../src/ai/poker/profiles';

type Job =
  | { kind: 'dup'; a: BotSpec; b: BotSpec; pairs: number; seed: number; iters: number; key: string }
  | { kind: 'ring'; bots: BotSpec[]; hands: number; seed: number; iters: number; key: string }
  | { kind: 'freeze'; a: BotSpec; b: BotSpec; matches: number; seed: number; iters: number; key: string };

const bot = (level: PokerLevel, id: string = level, profile?: string): BotSpec => ({ id, level, style: profile ? rivalById(profile).style : undefined });

function runJob(job: Job): unknown {
  switch (job.kind) {
    case 'dup':
      return duplicateHeadsUpRaw(job.a, job.b, job.pairs, job.seed, job.iters);
    case 'ring':
      return ringGame(job.bots, job.hands, job.seed, job.iters);
    case 'freeze': {
      let wins = 0;
      let hands = 0;
      for (let m = 0; m < job.matches; m++) {
        const r = freezeout(job.a, job.b, job.seed + m * 101, job.iters);
        if (r.winner === 0) wins++;
        hands += r.hands;
      }
      return { wins, matches: job.matches, hands };
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jobArg = args.indexOf('--job');
  if (jobArg >= 0) {
    const job = JSON.parse(args[jobArg + 1]!) as Job;
    process.stdout.write(JSON.stringify(runJob(job)));
    return;
  }
  const quick = args.includes('--quick');
  const pairs = quick ? 1500 : 12500; // por bloque (2 bloques por enfrentamiento)
  const iters = quick ? 250 : 400;
  const jobs: Job[] = [];
  const matchups: [PokerLevel, PokerLevel][] = [
    ['expert', 'advanced'], ['expert', 'intermediate'], ['expert', 'beginner'],
    ['advanced', 'intermediate'], ['intermediate', 'beginner'], ['expert', 'expert'],
  ];
  let seed = 1000;
  for (const [x, y] of matchups) {
    for (let chunk = 0; chunk < 2; chunk++) {
      jobs.push({ kind: 'dup', a: bot(x, 'A'), b: bot(y, 'B'), pairs, seed: seed++, iters, key: `${x}-vs-${y}` });
    }
  }
  // Experto con distintos perfiles de personaje contra Avanzado.
  for (const prof of ['guero', 'chayo', 'chema']) {
    jobs.push({ kind: 'dup', a: bot('expert', 'A', prof), b: bot('advanced', 'B'), pairs: Math.round(pairs / 2), seed: seed++, iters, key: `expert(${prof})-vs-advanced` });
  }
  jobs.push({
    kind: 'ring', key: 'ring6',
    bots: [bot('expert', 'E1'), bot('advanced', 'A1'), bot('intermediate', 'I1'), bot('beginner', 'B1'), bot('advanced', 'A2'), bot('intermediate', 'I2')],
    hands: quick ? 3000 : 24000, seed: seed++, iters,
  });
  for (const opp of ['advanced', 'intermediate', 'beginner'] as PokerLevel[]) {
    jobs.push({ kind: 'freeze', a: bot('expert', 'A'), b: bot(opp, 'B'), matches: quick ? 30 : 150, seed: seed++, iters, key: `freeze-expert-vs-${opp}` });
  }

  const self = fileURLToPath(import.meta.url);
  const concurrency = Math.max(1, cpus().length);
  const results = new Map<string, unknown[]>();
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const out = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', self, '--job', JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'inherit'] });
        let buf = '';
        child.stdout.on('data', (d) => (buf += d));
        child.on('exit', (code) => (code === 0 ? resolve(buf) : reject(new Error(`job ${job.key} falló (${code})`))));
      });
      const arr = results.get(job.key) ?? [];
      arr.push(JSON.parse(out));
      results.set(job.key, arr);
      done++;
      console.log(`[${done}/${jobs.length}] ${job.key} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const name = (k: string) => k.replace(/expert|advanced|intermediate|beginner/g, (m) => LEVEL_NAMES_ES[m as PokerLevel]);
  const dup: Record<string, ReturnType<typeof rawToResult>> = {};
  for (const [k, arr] of results) {
    if (k.includes('-vs-') && !k.startsWith('freeze')) dup[k] = rawToResult(mergeRaw(arr as RawStats[]));
  }
  const ring = results.get('ring6')![0] as { id: string; level: PokerLevel; bb100: number; se: number }[];
  const freeze: Record<string, { wins: number; matches: number; hands: number }> = {};
  for (const [k, arr] of results) if (k.startsWith('freeze')) freeze[k] = arr[0] as never;

  const lines: string[] = [];
  lines.push('# Torneos automáticos de IA de póker', '');
  lines.push(`Generado: ${new Date().toISOString()} · Simulaciones Monte Carlo por decisión del Experto: ${iters} · Duración: ${((Date.now() - t0) / 1000).toFixed(0)} s`, '');
  lines.push('## 1. Mano a mano duplicado (100 BB, cash)', '');
  lines.push('Cada mazo se juega dos veces con las cartas intercambiadas. bb/100 = ciegas grandes ganadas por cada 100 manos por el primer bot.', '');
  lines.push('| Enfrentamiento | Manos | bb/100 | Error est. | IC 95 % | ¿Significativo? |');
  lines.push('|---|---:|---:|---:|---|---|');
  for (const [k, r] of Object.entries(dup)) {
    const sig = r.ciLow > 0 ? 'Sí, gana el primero' : r.ciHigh < 0 ? 'Sí, gana el segundo' : 'No (empate estadístico)';
    lines.push(`| ${name(k)} | ${r.hands.toLocaleString('es-MX')} | ${r.bb100.toFixed(1)} | ${r.se.toFixed(1)} | [${r.ciLow.toFixed(1)}, ${r.ciHigh.toFixed(1)}] | ${sig} |`);
  }
  lines.push('', '## 2. Mesa de 6 jugadores (rotación de asientos)', '');
  lines.push('| Bot | Nivel | bb/100 | Error est. |', '|---|---|---:|---:|');
  for (const r of ring) lines.push(`| ${r.id} | ${LEVEL_NAMES_ES[r.level]} | ${r.bb100.toFixed(1)} | ${r.se.toFixed(1)} |`);
  lines.push('', '## 3. Freezeouts mano a mano (50 BB, ciegas que se duplican cada 40 manos)', '');
  lines.push('| Enfrentamiento | Partidas | Victorias del Experto | % | IC 95 % (Wilson) |', '|---|---:|---:|---:|---|');
  for (const [k, f] of Object.entries(freeze)) {
    const p = f.wins / f.matches;
    const z = 1.96, n = f.matches;
    const center = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    lines.push(`| ${name(k.replace('freeze-', ''))} | ${n} | ${f.wins} | ${(p * 100).toFixed(1)}% | [${((center - half) * 100).toFixed(1)}%, ${((center + half) * 100).toFixed(1)}%] |`);
  }
  const md = lines.join('\n') + '\n';
  mkdirSync(new URL('../reports', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../reports/tournament${quick ? '-quick' : ''}.md`, import.meta.url), md);
  writeFileSync(new URL(`../reports/tournament${quick ? '-quick' : ''}.json`, import.meta.url), JSON.stringify({ dup, ring, freeze, iters }, null, 2));
  console.log('\n' + md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
