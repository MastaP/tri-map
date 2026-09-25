import { expect, test } from '@playwright/test';
import { openApp, waitForMap } from './helpers';

const cards = (page: import('@playwright/test').Page) => page.locator('li[data-race-id]');
const sidebar = (page: import('@playwright/test').Page) =>
  page.getByRole('complementary', { name: 'Search and results' });
const resultCount = (page: import('@playwright/test').Page) =>
  page.locator('[aria-live="polite"][aria-atomic="true"]').first();

test.describe('TriMap smoke', () => {
  test('loads and renders the list before/independently of the map', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible();
    await expect(cards(page)).toHaveCount(16);
    await expect(resultCount(page)).toContainText('16 races');
    // Freshness from the newest verifiedAt in the fixtures.
    await expect(page.getByText('Race data checked Sep 2026').first()).toBeVisible();
  });

  test('map canvas and brand markers are present', async ({ page }) => {
    await openApp(page);
    await waitForMap(page);
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    expect(await page.locator('.tm-marker').count()).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Fit map to results' })).toBeEnabled();
  });

  test('theme switch swaps the basemap without losing markers', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page, '/', { theme: 'light' });
    await waitForMap(page);
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.waitForTimeout(1500);
    expect(await page.locator('.tm-marker').count()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(errors).toEqual([]);
  });

  test('a cluster of co-located races opens a popup listing them', async ({ page }) => {
    await openApp(page, '/?region=europe&brand=challenge');
    await waitForMap(page);
    const almere = page.locator('.tm-cluster button[aria-label^="2 races: 2 Challenge"]');
    await expect(almere).toBeVisible({ timeout: 10_000 });
    await almere.click({ force: true });
    const popup = page.locator('.maplibregl-popup');
    await expect(popup).toContainText('2 races at this venue', { timeout: 10_000 });
    await popup.getByRole('button', { name: /Challenge Almere-Amsterdam · Half/ }).click();
    await expect(page).toHaveURL(/race=challenge-almere-amsterdam-half/);
  });

  test('filters reduce results and are mirrored to the URL', async ({ page }) => {
    await openApp(page);
    await page
      .getByRole('group', { name: 'Region' })
      .getByRole('button', { name: /Oceania/ })
      .click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Challenge Wanaka');
    await expect(page).toHaveURL(/region=oceania/);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(16);

    // Accent-insensitive search; "/" focuses the search box.
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('florianopolis');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('IRONMAN Brasil');

    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('button', { name: /^Full distance/ }).click();
    await expect(cards(page)).toHaveCount(9);
    await page.getByRole('switch', { name: /Estimated dates/ }).click();
    await expect(cards(page)).toHaveCount(8); // Challenge Roth only has an estimated date
    await expect(page).toHaveURL(/dist=full.*est=0/);
  });

  test('time presets and the empty state', async ({ page }) => {
    await openApp(page, '/?when=3m');
    await expect(cards(page)).toHaveCount(5);
    await page
      .getByRole('group', { name: 'Region' })
      .getByRole('button', { name: /Oceania/ })
      .click();
    await expect(page.getByText('No races match')).toBeVisible();
    await page
      .getByRole('button', { name: /Any time/ })
      .last()
      .click();
    await expect(cards(page)).toHaveCount(1);
  });

  test('selecting a race opens the detail; Esc and Back close it', async ({ page }) => {
    await openApp(page);
    await sidebar(page)
      .getByRole('button', { name: /^T100 French Riviera/ })
      .click();
    const heading = page.getByRole('heading', { level: 2, name: 'T100 French Riviera' });
    await expect(heading).toBeVisible();
    await expect(page).toHaveURL(/race=t100-french-riviera-t100/);
    await expect(page.getByRole('link', { name: /Official website/ })).toHaveAttribute('href', /t100triathlon\.com/);
    await page.keyboard.press('Escape');
    await expect(heading).toBeHidden();
    await expect(page).not.toHaveURL(/race=/);

    await sidebar(page)
      .getByRole('button', { name: /^IRONMAN Cozumel/ })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: 'IRONMAN Cozumel' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 2, name: 'IRONMAN Cozumel' })).toBeHidden();
  });

  test('a quick double Esc closes the detail without leaving the site', async ({ page }) => {
    await openApp(page);
    await sidebar(page)
      .getByRole('button', { name: /^T100 Dubai/ })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: 'T100 Dubai' })).toBeVisible();
    // Two closes in the same task, before popstate can arrive (e.g. a fast double click).
    await page.evaluate(() => {
      for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect(page.getByRole('link', { name: 'TriMap home' })).toBeVisible();
  });

  test('deep link shows an estimated date and co-located races', async ({ page }) => {
    await openApp(page, '/?race=challenge-roth-full');
    await expect(page.getByRole('heading', { level: 2, name: 'Challenge Roth' })).toBeVisible();
    await expect(page.getByText('≈ July 2027').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to calendar/ })).toBeDisabled();

    await page.goto('/?race=challenge-almere-amsterdam-full');
    await page.getByRole('button', { name: /Also here/ }).click();
    await expect(page).toHaveURL(/race=challenge-almere-amsterdam-half/);
    await expect(page.getByText('Half distance').first()).toBeVisible();
  });

  test('add to calendar downloads an .ics file', async ({ page }) => {
    await openApp(page, '/?race=ironman-cozumel-full');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Add to calendar/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('ironman-cozumel-full-2026-11-22.ics');
  });

  test('shortlist persists across reloads', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Add IRONMAN Cozumel to shortlist' }).click();
    await page.reload();
    await page.getByRole('switch', { name: /Shortlist/ }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('IRONMAN Cozumel');
  });

  test('mobile: list/map toggle and filter sheet', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openApp(page);
    await expect(cards(page)).toHaveCount(16);
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /T100 distance/ }).click();
    await sheet.getByRole('button', { name: /Show 2 races/ }).click();
    await expect(sheet).toBeHidden();
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole('button', { name: /^Map$/ }).click();
    await waitForMap(page);
    await expect(page.getByRole('button', { name: /List/ })).toBeVisible();
    await context.close();
  });
});
