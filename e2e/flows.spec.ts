import { test, expect, seedProfile, chipsShown } from './fixtures';

test.describe('Flujos principales', () => {
  test('onboarding completo y lobby', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bienvenido a Casino Pepón' })).toBeVisible();
    await expect(page.getByText(/no tienen valor real/)).toBeVisible();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('switch', { name: 'Coach activado' }).isVisible();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.getByRole('button', { name: /^Texas Hold’em:/ })).toBeVisible();
    expect(await chipsShown(page)).toBe(10000);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
  });

  test('reiniciar fichas gratis', async ({ page }) => {
    await seedProfile(page, { chips: 120 });
    await page.goto('/');
    expect(await chipsShown(page)).toBe(120);
    await expect(page.getByText(/Te quedan pocas fichas/)).toBeVisible();
    await page.getByRole('button', { name: 'Reiniciar fichas gratis' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reiniciar' }).click();
    expect(await chipsShown(page)).toBe(10000);
  });

  test('póker: sentarse, jugar manos con coach y salir devolviendo las fichas', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/poker');
    await page.getByRole('radio', { name: '2' }).first().click();
    await page.getByRole('radio', { name: 'Experto' }).click();
    await page.getByRole('button', { name: 'Sentarse a jugar' }).click();
    expect(await chipsShown(page)).toBe(8000);
    let handsDone = 0;
    for (let step = 0; step < 120 && handsDone < 2; step++) {
      const next = page.getByRole('button', { name: /Siguiente mano/ });
      if (await next.isVisible().catch(() => false)) {
        handsDone++;
        if (handsDone < 2) await next.click();
        continue;
      }
      const lost = page.getByRole('dialog', { name: /sin fichas|Ganaste la mesa/ });
      if (await lost.isVisible().catch(() => false)) break;
      const check = page.getByRole('button', { name: /^Pasar/ });
      const call = page.getByRole('button', { name: /^(Igualar|All-in)/ });
      if (await check.isVisible().catch(() => false)) {
        await expect(page.locator('.coach-card')).toBeVisible();
        await check.click();
      } else if (await call.isVisible().catch(() => false)) {
        await call.click();
      } else {
        await page.waitForTimeout(250);
      }
    }
    expect(handsDone).toBeGreaterThanOrEqual(1);
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('button', { name: /^Texas Hold’em:/ })).toBeVisible();
    const chips = await chipsShown(page);
    expect(chips).toBeGreaterThan(8000 - 1);
    await page.goto('/#/history');
    await expect(page.locator('.hist-item').first()).toBeVisible();
  });

  test('póker: subir con el panel de apuesta y atajos de teclado', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/poker');
    await page.getByRole('radio', { name: '1' }).first().click();
    await page.getByRole('button', { name: 'Sentarse a jugar' }).click();
    for (let i = 0; i < 60; i++) {
      if (await page.getByRole('button', { name: /^(Subir|Apostar)/ }).isVisible().catch(() => false)) break;
      if (await page.getByRole('button', { name: /Siguiente mano/ }).isVisible().catch(() => false)) await page.keyboard.press('n');
      await page.waitForTimeout(200);
    }
    await page.keyboard.press('r');
    await expect(page.getByRole('slider', { name: 'Cantidad a apostar' })).toBeVisible();
    await page.getByRole('button', { name: 'Bote', exact: true }).click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('slider', { name: 'Cantidad a apostar' })).toBeHidden();
  });

  test('blackjack: apostar, jugar y liquidar; cambiar reglas', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/blackjack');
    await page.getByRole('button', { name: 'Limpiar' }).click();
    await page.getByRole('button', { name: 'Agregar 100', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar 25', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Repartir 125/ })).toBeEnabled();
    for (let round = 0; round < 3; round++) {
      await page.getByRole('button', { name: /^Repartir/ }).click();
      for (let i = 0; i < 80; i++) {
        if (await page.getByRole('button', { name: /^Repartir/ }).isVisible().catch(() => false)) break;
        if (await page.getByRole('button', { name: /^No/ }).isVisible().catch(() => false)) { await page.keyboard.press('n'); continue; }
        if (await page.getByRole('button', { name: /^Plantarse/ }).isVisible().catch(() => false)) {
          await expect(page.locator('.coach-card')).toBeVisible();
          await page.keyboard.press('s');
          continue;
        }
        await page.waitForTimeout(150);
      }
      await expect(page.locator('.bj-outcome').first()).toBeVisible();
    }
    await page.getByRole('button', { name: /^Reglas/ }).click();
    await page.getByRole('dialog').getByRole('radio', { name: '2' }).first().click();
    await page.getByRole('dialog').getByRole('switch', { name: /17 suave/ }).click();
    await page.getByRole('button', { name: 'Aplicar y barajar' }).click();
    await expect(page.getByRole('button', { name: /2 mazos · H17/ })).toBeVisible();
    await page.goto('/#/stats');
    await page.getByRole('radio', { name: 'Blackjack' }).click();
    await expect(page.locator('.stat-value').first()).not.toHaveText('0');
  });

  test('ruleta: apuestas, selector táctil de combinaciones, giro y estadísticas', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/roulette');
    await page.getByRole('radio', { name: /Ficha de 100 \(/ }).click();
    await page.getByRole('button', { name: /^Rojo, paga 1 a 1/ }).click();
    await page.getByRole('radio', { name: 'Elegir combinación' }).click();
    await page.getByRole('button', { name: 'Número 17 negro' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Caballo 17-20/ }).click();
    await expect(page.locator('.combo-list li')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Girar 200/ })).toBeVisible();
    await page.keyboard.press('z');
    await expect(page.locator('.combo-list li')).toHaveCount(0);
    await page.keyboard.press(' ');
    await expect(page.locator('.spin-result .num-ball')).toBeVisible({ timeout: 15000 });
    await page.goto('/#/stats');
    await page.getByRole('radio', { name: 'Ruleta' }).click();
    await expect(page.getByText(/Lo esperado vs. lo real/)).toBeVisible();
    await page.goto('/#/history');
    await page.getByRole('radio', { name: 'Ruleta' }).click();
    await expect(page.locator('.hist-item')).toHaveCount(1);
  });

  test('cómo funciona, ajustes y reducción de movimiento', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/how');
    await expect(page.getByText('No existe una estrategia que elimine la ventaja de la casa.')).toBeVisible();
    await expect(page.getByText(/Fisher–Yates/).first()).toBeVisible();
    await page.goto('/#/settings');
    await page.getByRole('radio', { name: 'Reducidas' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await page.getByRole('switch', { name: 'Sonido' }).click();
    await expect(page.getByRole('switch', { name: 'Sonido' })).toHaveAttribute('aria-checked', 'true');
  });

  test('accesibilidad básica: todos los botones tienen nombre accesible y no hay errores de consola/CSP', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await seedProfile(page);
    for (const r of ['', 'poker', 'blackjack', 'roulette', 'stats', 'history', 'how', 'settings', 'videopoker', 'baccarat', 'trescartas', 'dados', 'tragamonedas', 'keno', 'mayormenor']) {
      await page.goto(`/#/${r}`);
      await page.waitForTimeout(300);
      const unnamed = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a, [role="switch"], [role="radio"]')).filter((el) => {
          const name = (el.getAttribute('aria-label') ?? '') + (el.textContent ?? '');
          return name.trim().length === 0;
        }).length,
      );
      expect(unnamed, `ruta ${r}`).toBe(0);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Integridad: salir o recargar no anula una mano', () => {
  test('blackjack: salir a mitad de ronda la resuelve y la registra', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/blackjack');
    await page.getByRole('button', { name: 'Limpiar' }).click();
    await page.getByRole('button', { name: 'Agregar 100', exact: true }).click();
    await page.getByRole('button', { name: /^Repartir/ }).click();
    await page.goto('/#/');
    await page.goto('/#/history');
    await page.getByRole('radio', { name: 'Blackjack' }).click();
    await expect(page.locator('.hist-item')).toHaveCount(1);
  });

  test('póker: recargar a mitad de mano cuenta como retirada', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/#/poker');
    await page.getByRole('radio', { name: '1' }).first().click();
    await page.getByRole('button', { name: 'Sentarse a jugar' }).click();
    for (let i = 0; i < 60; i++) {
      if (await page.locator('.action-buttons').isVisible().catch(() => false)) break;
      if (await page.getByRole('button', { name: /Siguiente mano/ }).isVisible().catch(() => false)) await page.keyboard.press('n');
      await page.waitForTimeout(200);
    }
    await page.reload();
    await expect(page.getByText(/La mano interrumpida se contó como retirada/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Repartir/ })).toBeVisible();
  });
});

test.describe('PWA offline', () => {
  test('funciona sin conexión después de la primera carga', async ({ page, context }) => {
    await seedProfile(page);
    await page.goto('/');
    // Esperar a que el service worker controle la página (clientsClaim).
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 20000 });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Texas Hold’em:/ })).toBeVisible();
    await page.goto('/#/roulette');
    await expect(page.getByRole('button', { name: /^Rojo, paga/ })).toBeVisible();
    const manifest = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
    expect(manifest).toBeTruthy();
    await context.setOffline(false);
  });
});
