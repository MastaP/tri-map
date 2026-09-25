import { expect, type Page } from '@playwright/test';

/** The fixture data is dated relative to 2026-09-25; freeze the clock there. */
export const FIXED_NOW = new Date('2026-09-25T10:00:00');

export async function openApp(page: Page, path = '/', { theme }: { theme?: 'light' | 'dark' } = {}) {
  await page.clock.setFixedTime(FIXED_NOW);
  if (theme) await page.emulateMedia({ colorScheme: theme });
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'TriMap home' })).toBeVisible();
}

/** Wait until the map has drawn its canvas and at least one HTML marker. */
export async function waitForMap(page: Page) {
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => document.querySelectorAll('.tm-marker').length > 0, undefined, { timeout: 20_000 });
}
