import { test, expect, seedProfile, noHorizontalScroll } from './fixtures';

const VIEWPORTS = [
  { w: 360, h: 800 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 844, h: 390, label: 'celular horizontal' },
];

async function inViewport(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).first().waitFor({ state: 'visible' });
  const box = await page.locator(selector).first().boundingBox();
  const vp = page.viewportSize()!;
  expect(box, selector).not.toBeNull();
  expect(box!.x, `${selector} x`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${selector} y`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${selector} derecha`).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height, `${selector} abajo`).toBeLessThanOrEqual(vp.height + 1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.w}x${vp.h}${vp.label ? ` (${vp.label})` : ''}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test('lobby, estadísticas y reglas sin scroll horizontal', async ({ page }, info) => {
      await seedProfile(page);
      for (const r of ['', 'stats', 'history', 'how', 'settings']) {
        await page.goto(`/#/${r}`);
        await page.waitForTimeout(250);
        await noHorizontalScroll(page);
      }
      await page.goto('/');
      await page.waitForTimeout(600);
      await info.attach('lobby', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('mesa de póker: asientos, tablero y botones visibles', async ({ page }, info) => {
      await seedProfile(page);
      await page.goto('/#/poker');
      await page.getByRole('radio', { name: '5' }).first().click();
      await page.getByRole('button', { name: 'Sentarse a jugar' }).click();
      await expect(page.locator('.seat')).toHaveCount(6);
      await noHorizontalScroll(page);
      for (let i = 0; i < 6; i++) await inViewport(page, `.seat >> nth=${i}`);
      await inViewport(page, '.board');
      for (let i = 0; i < 80; i++) {
        if (await page.locator('.action-buttons').isVisible().catch(() => false)) break;
        if (await page.getByRole('button', { name: /Siguiente mano/ }).isVisible().catch(() => false)) await page.getByRole('button', { name: /Siguiente mano/ }).click();
        await page.waitForTimeout(200);
      }
      await inViewport(page, '.action-buttons');
      const btn = await page.locator('.act-btn').first().boundingBox();
      expect(btn!.height, 'botones cómodos para el pulgar').toBeGreaterThanOrEqual(44);
      await info.attach('poker', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('blackjack y ruleta caben en pantalla', async ({ page }, info) => {
      await seedProfile(page);
      await page.goto('/#/blackjack');
      await noHorizontalScroll(page);
      await inViewport(page, '.chip-row');
      await page.getByRole('button', { name: /^Repartir/ }).click();
      await page.waitForTimeout(600);
      await noHorizontalScroll(page);
      await info.attach('blackjack', { body: await page.screenshot(), contentType: 'image/png' });
      await page.goto('/#/roulette');
      await noHorizontalScroll(page);
      await inViewport(page, '.dock');
      await page.getByRole('button', { name: 'Número 7 rojo' }).click();
      await info.attach('roulette', { body: await page.screenshot(), contentType: 'image/png' });
    });
  });
}
