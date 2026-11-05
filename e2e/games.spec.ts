import { test, expect, seedProfile, chipsShown, noHorizontalScroll } from './fixtures';

test.describe('Juegos adicionales', () => {
  test('lobby: 10 juegos y filtro por categoría', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/');
    await expect(page.locator('.game-card')).toHaveCount(10);
    await page.getByRole('radio', { name: /^Máquinas/ }).click();
    await expect(page.locator('.game-card')).toHaveCount(2);
    await page.getByRole('radio', { name: /^Todos/ }).click();
    await page.getByRole('button', { name: /^Video póker:/ }).click();
    await expect(page).toHaveURL(/#\/?videopoker/);
  });

  test('video póker: repartir, ver el coach exacto, conservar y cambiar', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/videopoker');
    await page.getByRole('button', { name: /^Repartir/ }).click();
    await expect(page.getByText(/^Conserva:/)).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('1');
    await expect(page.getByRole('button', { name: /^Carta 1:.*conservada/ })).toBeVisible();
    await page.getByRole('button', { name: /^Cambiar cartas/ }).click();
    await expect(page.locator('.result-banner')).toBeVisible();
    await page.goto('/#/stats');
    await page.getByRole('radio', { name: 'Más juegos' }).click();
    await expect(page.getByRole('cell', { name: 'Video póker' })).toBeVisible();
  });

  test('baccarat: apostar a Banca y liquidar', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/baccarat');
    await page.getByRole('button', { name: /^Banca, paga/ }).click();
    await page.getByRole('button', { name: /^Repartir/ }).click();
    await expect(page.locator('.result-banner')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.road-dot')).toHaveCount(1);
  });

  test('póker de 3 cartas: coach con EV y decisión', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/trescartas');
    await page.getByRole('button', { name: /^Repartir/ }).click();
    await expect(page.getByText('EV jugar')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('j');
    await expect(page.locator('.result-banner')).toBeVisible();
  });

  test('tres dados: apuestas, lanzamiento y probabilidades', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/dados');
    await page.getByRole('button', { name: /^Chico \(4–10\), paga 1:1/ }).click();
    await page.getByRole('button', { name: /^Suma 11/ }).click();
    await page.getByRole('button', { name: /^Lanzar/ }).click();
    await expect(page.locator('.result-banner')).toBeVisible({ timeout: 6000 });
  });

  test('tragamonedas: girar con Espacio y ver el RTP exacto', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/tragamonedas');
    await expect(page.getByText(/RTP exacto: 96\.57/)).toBeVisible();
    await page.locator('.slot-window').waitFor();
    const before = await chipsShown(page);
    await page.keyboard.press(' ');
    await expect(page.locator('.result-banner')).toBeVisible({ timeout: 6000 });
    const after = await chipsShown(page);
    expect(after).not.toBeNaN();
    expect(before - 25 <= after).toBe(true);
    await page.getByRole('button', { name: 'Tabla de pagos' }).click();
    await expect(page.locator('.slot-pays')).toBeVisible();
  });

  test('keno: al azar y sortear', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/keno');
    await page.locator('.keno-board').waitFor();
    await page.keyboard.press('q');
    await expect(page.locator('.keno-num.picked')).toHaveCount(6);
    await page.getByRole('button', { name: /^Sortear/ }).click();
    await expect(page.locator('.result-banner')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.keno-num.drawn')).toHaveCount(20);
  });

  test('mayor o menor: apostar y liquidar', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/mayormenor');
    const lower = page.getByRole('button', { name: /^Menor:/ });
    const higher = page.getByRole('button', { name: /^Mayor:/ });
    if (await higher.isEnabled()) await higher.click(); else await lower.click();
    await expect(page.locator('.result-banner')).toBeVisible();
    await page.goto('/#/history');
    await page.getByRole('radio', { name: 'Más juegos' }).click();
    await expect(page.locator('.hist-item')).toHaveCount(1);
  });

  test('salir durante la animación liquida la ronda (tragamonedas)', async ({ page }) => {
    await seedProfile(page, { settings: { speed: 'fast', coach: true, motion: 'full' } });
    await page.goto('/#/tragamonedas');
    await page.getByRole('button', { name: /^Girar/ }).click();
    await page.goto('/#/history');
    await page.getByRole('radio', { name: 'Más juegos' }).click();
    await expect(page.locator('.hist-item')).toHaveCount(1);
  });
});

for (const vp of [{ w: 360, h: 800 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1366, h: 768 }, { w: 1920, h: 1080 }, { w: 844, h: 390 }]) {
  test(`juegos adicionales sin scroll horizontal en ${vp.w}x${vp.h}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await seedProfile(page);
    for (const r of ['videopoker', 'baccarat', 'trescartas', 'dados', 'tragamonedas', 'keno', 'mayormenor']) {
      await page.goto(`/#/${r}`);
      await page.locator('.dock').waitFor({ state: 'visible' });
      await noHorizontalScroll(page);
      const dock = await page.locator('.dock').boundingBox();
      expect(dock!.y + dock!.height, `${r}: dock dentro de la pantalla`).toBeLessThanOrEqual(vp.h + 1);
    }
  });
}

test('ranking: periodos y resultado propio fuera de claude.ai', async ({ page }) => {
  await seedProfile(page);
  await page.goto('/#/mayormenor');
  const higher = page.getByRole('button', { name: /^Mayor:/ });
  if (await higher.isEnabled()) await higher.click(); else await page.getByRole('button', { name: /^Menor:/ }).click();
  await expect(page.locator('.result-banner')).toBeVisible();
  await page.goto('/#/ranking');
  await expect(page.getByText(/funciona en la versión publicada en claude.ai/)).toBeVisible();
  await expect(page.getByText(/1 ronda/)).toBeVisible();
  for (const p of ['Diario', 'Semanal', 'Mensual']) {
    await page.getByRole('radio', { name: p }).click();
    await expect(page.locator('.rank-me-net')).toBeVisible();
  }
});
