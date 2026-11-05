import { test as base, expect, type Page } from '@playwright/test';

/** Perfil inicial: onboarding y tutoriales ya vistos (para pruebas enfocadas). */
export async function seedProfile(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((ex) => {
    if (!localStorage.getItem('casino-pepon:v1')) {
      localStorage.setItem(
        'casino-pepon:v1',
        JSON.stringify({ onboardingDone: true, tutorialsSeen: { poker: true, blackjack: true, roulette: true, videopoker: true, baccarat: true, trescartas: true, dados: true, tragamonedas: true, keno: true, mayormenor: true }, settings: { speed: 'fast', coach: true, motion: 'reduce' }, ...ex }),
      );
    }
  }, extra);
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, 'sin scroll horizontal').toBeLessThanOrEqual(iw);
}

export async function chipsShown(page: Page): Promise<number> {
  const t = await page.locator('.balance-num').first().innerText();
  return Number(t.replace(/[^\d]/g, ''));
}

export const test = base;
export { expect };
