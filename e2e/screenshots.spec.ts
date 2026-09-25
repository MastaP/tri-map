import { test, type Browser, type Page } from '@playwright/test';
import { expandSoon, openApp, openFilterPanel, waitForMap } from './helpers';

/**
 * `npm run screenshots` regenerates docs/screenshots/*.png from the fixture data.
 * Set SCREENSHOTS_DIR to write them somewhere else (e.g. to review a change).
 */
const OUT = process.env.SCREENSHOTS_DIR ?? 'docs/screenshots';

async function settle(page: Page, { map = true }: { map?: boolean } = {}) {
  // Phones load the map only when it is shown.
  if (map) await waitForMap(page);
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

  test('desktop course and entry filters', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/?bike=flat,rolling&open=1', { theme: 'light' });
    await settle(page);
    await openFilterPanel(page);
    await page.locator('#filter-panel').getByRole('region', { name: 'Course' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/desktop-filters.png` });
  });

  test('desktop nearest', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      geolocation: { latitude: 50.11, longitude: 8.68 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    await openApp(page, '/');
    await settle(page);
    await page.getByRole('button', { name: /^Nearest/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/desktop-nearest.png` });
    await context.close();
  });

  test('desktop replaced race', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/?race=challenge-wanaka-half', { theme: 'dark' });
    await settle(page);
    await page.screenshot({ path: `${OUT}/desktop-successor.png` });
  });

  test('desktop season planning (2027, T100 and halves)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/?when=next-year&dist=half,t100', { theme: 'light' });
    await settle(page);
    await page.screenshot({ path: `${OUT}/desktop-2027.png` });
  });

  test('desktop europe zoom', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, '/?region=europe', { theme: 'light' });
    await settle(page);
    await page.waitForTimeout(1200); // fit animation
    await page.locator('main li[data-race-id="challenge-roth-full"]').hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/desktop-europe.png` });
  });

  test('mobile', async ({ browser }) => {
    const { context, page } = await mobile(browser);
    await openApp(page, '/');
    await settle(page, { map: false });
    await page.screenshot({ path: `${OUT}/mobile.png` });
    await page.getByRole('button', { name: /^Map$/ }).click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/mobile-map.png` });
    await context.close();
  });

  test('mobile filters and detail', async ({ browser }) => {
    const { context, page } = await mobile(browser, 'dark');
    await openApp(page, '/');
    await settle(page, { map: false });
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/mobile-filters.png` });
    await page
      .getByRole('group', { name: 'Bike course' })
      .getByRole('button', { name: /Rolling/ })
      .click();
    await page.getByRole('switch', { name: /Open entry only/ }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/mobile-filters-course.png` });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/mobile-course-results.png` });
    await expandSoon(page);
    await page.locator('li[data-race-id="ironman-kailua-kona-full"] h4 button').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/mobile-detail.png` });
    await page.getByRole('region', { name: 'Course details' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/mobile-detail-course.png` });
    await context.close();
  });
});
