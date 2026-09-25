import { expect, test } from '@playwright/test';
import { expandSoon, expectResults, openApp, openFilterPanel, waitForMap } from './helpers';

const cards = (page: import('@playwright/test').Page) => page.locator('li[data-race-id]');
const sidebar = (page: import('@playwright/test').Page) => page.getByRole('main');

test.describe('TriMap smoke', () => {
  test('loads and renders the list before/independently of the map', async ({ page }) => {
    await openApp(page);
    await expectResults(page, 16);
    // Races in the next three weeks (T100 French Riviera, Kona) start folded away.
    const soon = page.getByRole('button', { name: /^Next 3 weeks/ });
    await expect(soon).toHaveAttribute('aria-expanded', 'false');
    await expect(soon).toContainText('2');
    await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    await expect(cards(page)).toHaveCount(14);
    await soon.click();
    await expect(cards(page)).toHaveCount(16);
    await expect(cards(page).first()).toHaveAttribute('data-race-id', 't100-french-riviera-t100');
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
    // Distance and dates are always in view; the rest sits behind "Filters".
    await expect(page.locator('#filter-panel')).toBeHidden();
    await openFilterPanel(page);
    await page
      .getByRole('group', { name: 'Region' })
      .getByRole('button', { name: /Oceania/ })
      .click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('T100 Wanaka');
    await expect(page).toHaveURL(/region=oceania/);

    // With the panel closed, the region filter stays visible as a removable chip.
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.locator('#filter-panel')).toBeHidden();
    await page.getByRole('button', { name: 'Oceania: remove filter' }).click();
    await expectResults(page, 16);
    await expect(page).not.toHaveURL(/region=/);

    // Accent-insensitive search; "/" focuses the search box.
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('florianopolis');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('IRONMAN Brasil');

    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('button', { name: /^Full distance/ }).click();
    await expectResults(page, 9);
    await openFilterPanel(page);
    await page.getByRole('switch', { name: /Estimated dates/ }).click();
    await expectResults(page, 10); // Challenge Roth only has an estimated date
    await expect(page).toHaveURL(/dist=full.*est=1/);
  });

  test('time presets and the empty state', async ({ page }) => {
    await openApp(page, '/?when=3m');
    await expectResults(page, 5);
    await expect(page.getByRole('button', { name: /^3 months/ })).toHaveAttribute('aria-pressed', 'true');
    await openFilterPanel(page);
    await page
      .getByRole('group', { name: 'Region' })
      .getByRole('button', { name: /Oceania/ })
      .click();
    await expect(page.getByText('No races match')).toBeVisible();
    await page.getByRole('button', { name: /^Any time/ }).click();
    await expectResults(page, 1);
    await expect(page.getByRole('button', { name: /^3 months/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test("a year search finds races whose next edition is earlier, shown with that year's date", async ({ page }) => {
    // Kona's next edition is Oct 2026; its 2027 edition is only estimated.
    await openApp(page, '/?from=2027-10&to=2027-12&est=1');
    await expectResults(page, 5);
    const kona = cards(page).filter({ hasText: 'IRONMAN World Championship' });
    await expect(kona).toContainText('≈ Oct 2027');
    await expect(kona.getByTestId('also-next')).toHaveText('(next: Oct 2026)');
    await expect(page.getByRole('heading', { name: 'October 2027' })).toBeVisible();
  });

  test('a date range from an old link is dropped with a notice', async ({ page }) => {
    await openApp(page, '/?from=2026-06&to=2026-08');
    await expect(page.getByText('That date range has passed')).toBeVisible();
    await expectResults(page, 16);
    await expect(page).not.toHaveURL(/from=/);
  });

  test('selecting a race opens the detail; Esc and Back close it', async ({ page }) => {
    await openApp(page);
    await expandSoon(page);
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
    await openApp(page, '/?race=challenge-roth-full&est=1');
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

  test('shortlist persists across reloads and compares courses', async ({ page }) => {
    await openApp(page, '/?est=1');
    await page.getByRole('button', { name: 'Add IRONMAN Cozumel to shortlist' }).click();
    await page.getByRole('button', { name: 'Add Challenge Roth to shortlist' }).click();
    await page.reload();
    await openFilterPanel(page);
    await page.getByRole('switch', { name: /Shortlist/ }).click();
    await expect(cards(page)).toHaveCount(2);
    // Shortlisted cards spell out swim, bike and run for comparing.
    await expect(cards(page).filter({ hasText: 'IRONMAN Cozumel' }).getByTestId('course-line')).toHaveText(
      /Sea.*Flat.*Flat/,
    );
    // Other filters that hide starred races are called out.
    await page
      .getByRole('group', { name: 'Region' })
      .getByRole('button', { name: /Europe/ })
      .click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByTestId('starred-hidden-note')).toHaveText('1 starred race is hidden by your other filters.');
    await page.getByRole('button', { name: 'Show all starred' }).click();
    await expect(cards(page)).toHaveCount(2);
    // "Show all starred" keeps estimated dates on, so Roth stays.
    await expect(page).toHaveURL(/\?est=1&star=1$/);
    // With estimated dates off, starred Roth waits for its date: that note, not "hidden by filters".
    await page.getByRole('switch', { name: /Estimated dates/ }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByTestId('estimated-hidden-note')).toHaveText('1 more race has no date announced yet.');
    await expect(page.getByTestId('starred-hidden-note')).toHaveCount(0);
  });

  test('mobile: list/map toggle and filter sheet', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openApp(page);
    await expectResults(page, 16);
    // The map is not loaded until it is needed.
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /T100 distance/ }).click();
    await sheet.getByRole('button', { name: /Show 3 races/ }).click();
    await expect(sheet).toBeHidden();
    await expectResults(page, 3);
    await page.getByRole('button', { name: /^Map$/ }).click();
    await waitForMap(page);
    await expect(page.getByRole('button', { name: /List/ })).toBeVisible();
    await context.close();
  });
});
