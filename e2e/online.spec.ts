import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Dos navegadores independientes juegan una mano en línea. La base de datos y la
 * identidad de claude.ai se simulan con un almacén compartido en el proceso de
 * prueba (mismas llamadas que usa la app: doc().set, collection().where().onSnapshot).
 */
const store: Record<string, unknown> = {};
const pages: Page[] = [];

async function setupPlayer(ctx: BrowserContext, uid: string, names: Record<string, string>): Promise<Page> {
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('casino-pepon:v1')) {
      localStorage.setItem('casino-pepon:v1', JSON.stringify({ onboardingDone: true, tutorialsSeen: { poker: true }, settings: { speed: 'fast', motion: 'reduce' } }));
    }
  });
  await ctx.exposeBinding('__mockdbGet', async () => store);
  await ctx.exposeBinding('__mockdbSet', async (_src, path: string, data: unknown) => {
    store[path] = data;
    for (const p of pages) await p.evaluate((s) => (window as unknown as { __mockdbPush: (s: unknown) => void }).__mockdbPush(s), store).catch(() => undefined);
  });
  await ctx.addInitScript(({ uid, names, initial }) => {
    const w = window as unknown as Record<string, unknown>;
    let mirror: Record<string, unknown> = initial;
    const subs = new Set<() => void>();
    w.__mockdbPush = (s: Record<string, unknown>) => { mirror = s; subs.forEach((f) => f()); };
    void (w.__mockdbGet as () => Promise<Record<string, unknown>>)().then((s) => (w.__mockdbPush as (s: unknown) => void)(s));
    const query = (path: string, filters: [string, unknown][]) => ({
      where: (f: string, _op: string, v: unknown) => query(path, [...filters, [f, v]]),
      orderBy: () => query(path, filters),
      limit: () => query(path, filters),
      onSnapshot(next: (s: unknown) => void) {
        const depth = path.split('/').length + 1;
        const run = () => {
          const docs = Object.entries(mirror)
            .filter(([p]) => p.startsWith(path + '/') && p.split('/').length === depth)
            .filter(([, d]) => filters.every(([f, v]) => (d as Record<string, unknown>)[f] === v))
            .map(([p, d]) => ({ id: p.split('/').pop(), exists: true, data: () => d }));
          next({ docs, metadata: { fromCache: false, hasPendingWrites: false } });
        };
        subs.add(run);
        setTimeout(run, 0);
        return () => subs.delete(run);
      },
    });
    const db = {
      doc: (path: string) => ({
        set: async (d: unknown) => { await (w.__mockdbSet as (p: string, d: unknown) => Promise<void>)(path, JSON.parse(JSON.stringify(d))); },
        get: async () => ({ id: path.split('/').pop(), exists: path in mirror, data: () => mirror[path] }),
      }),
      collection: (path: string) => query(path, []),
    };
    const user = {
      id: async () => uid,
      can: async () => true,
      profiles: async (ids: string[]) => Object.fromEntries(ids.map((i) => [i, { id: i, name: names[i] ?? '', avatarUrl: '', color: '#888', isMe: i === uid, guest: false, email: null }])),
    };
    w.claude = { use: async (n: string) => (n === 'db' ? db : n === 'user' ? user : null) };
  }, { uid, names, initial: store });
  const page = await ctx.newPage();
  pages.push(page);
  return page;
}

async function actIfMyTurn(page: Page): Promise<boolean> {
  for (const name of [/^Pasar/, /^Igualar/]) {
    const b = page.getByRole('button', { name });
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => undefined);
      return true;
    }
  }
  return false;
}

test('dos personas juegan una mano en línea con cartas cifradas', async ({ browser }) => {
  test.setTimeout(150_000);
  const names = { u_ana: 'Ana', u_beto: 'Beto' };
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const ana = await setupPlayer(ctxA, 'u_ana', names);
  const beto = await setupPlayer(ctxB, 'u_beto', names);

  await ana.goto('/#en-linea');
  await ana.getByRole('button', { name: 'Crear y sentarme' }).click();
  await expect(ana.getByText(/1 persona sentada/)).toBeVisible();

  await beto.goto('/#en-linea');
  await expect(beto.getByText('Mesa de los Pepones')).toBeVisible();
  await beto.getByRole('button', { name: 'Sentarme', exact: true }).click();

  const start = ana.getByRole('button', { name: 'Repartir la primera mano' });
  await expect(start).toBeEnabled({ timeout: 15000 });
  await start.click();

  // Cada quien ve sus propias cartas (2 cartas boca arriba en su asiento).
  await expect(ana.locator('.seat-human .seat-cards .pcard:not(.pcard-back)')).toHaveCount(2, { timeout: 30000 });
  await expect(beto.locator('.seat-human .seat-cards .pcard:not(.pcard-back)')).toHaveCount(2, { timeout: 30000 });
  // …y las del rival boca abajo.
  await expect(ana.locator('.seat:not(.seat-human) .pcard-back')).toHaveCount(2);
  if (process.env.SHOTS) {
    await ana.screenshot({ path: `${process.env.SHOTS}/online-ana.png` });
    await beto.screenshot({ path: `${process.env.SHOTS}/online-beto.png` });
  }

  const done = (p: Page) => p.getByText(/Mano terminada/).isVisible().catch(() => false);
  for (let i = 0; i < 200; i++) {
    if ((await done(ana)) && (await done(beto))) break;
    await actIfMyTurn(ana);
    await actIfMyTurn(beto);
    await ana.waitForTimeout(250);
  }
  await expect(ana.getByText(/Mano terminada/)).toBeVisible({ timeout: 20000 });
  await expect(beto.getByText(/Mano terminada/)).toBeVisible({ timeout: 20000 });

  // Tablero completo (se pasó/igualó hasta el river) y fichas conservadas.
  await expect(ana.locator('.board .pcard:not(.pcard-slot)')).toHaveCount(5);
  const chips = async (p: Page) => Number((await p.locator('.online-status small').innerText()).replace(/[^\d]/g, ''));
  expect((await chips(ana)) + (await chips(beto))).toBe(4000);

  // En el showdown se revelan las cartas de ambos.
  await expect(beto.locator('.seat:not(.seat-human) .seat-cards .pcard:not(.pcard-back)')).toHaveCount(2);

  // La siguiente mano arranca sola.
  await expect(ana.getByText(/Barajando|Repartiendo|turno|Turno/)).toBeVisible({ timeout: 20000 });

  // Salir: la mesa se cierra para Beto y sus fichas vuelven a su saldo.
  await ana.getByRole('button', { name: 'Salir', exact: true }).click();
  await ana.getByRole('dialog').getByRole('button', { name: 'Salir' }).click();
  await expect(beto.getByText(/cerró la mesa/)).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});
