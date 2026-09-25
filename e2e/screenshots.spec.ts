import { test, type Browser, type Page } from '@playwright/test';
import { openApp, waitForMap } from './helpers';

/**
 * `npm run screenshots` regenerates docs/screenshots/*.png from the fixture data.
 */
const OUT = 'docs/screenshots';

async function settle(page: Page) {
  await waitForMap(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

async function mobile(browser: Browser, theme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
  });
  return { context, page: await context.newPage() };
}

test.describe('screenshots', () => {
  test('desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/', { theme: 'light' });
    await settle(page);
    await page.screenshot({ path: `${OUT}/desktop-light.png` });
  });

  test('desktop dark', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/', { theme: 'dark' });
    await settle(page);
    await page.screenshot({ path: `${OUT}/desktop-dark.png` });
  });

  test('desktop detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/?race=challenge-almere-amsterdam-full', { theme: 'light' });
    await settle(page);
    await page.screenshot({ path: `${OUT}/desktop-detail.png` });
  });

  test('desktop europe zoom', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/?region=europe', { theme: 'light' });
    await settle(page);
    await page.waitForTimeout(1200); // fit animation
    await page.locator('aside li[data-race-id="challenge-roth-full"]').hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/desktop-europe.png` });
  });

  test('mobile', async ({ browser }) => {
    const { context, page } = await mobile(browser);
    await openApp(page, '/');
    await settle(page);
    await page.screenshot({ path: `${OUT}/mobile.png` });
    await page.getByRole('button', { name: /^Map$/ }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/mobile-map.png` });
    await context.close();
  });

  test('mobile filters and detail', async ({ browser }) => {
    const { context, page } = await mobile(browser, 'dark');
    await openApp(page, '/');
    await settle(page);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/mobile-filters.png` });
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('li[data-race-id="ironman-kailua-kona-full"] h4 button').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/mobile-detail.png` });
    await context.close();
  });
});
