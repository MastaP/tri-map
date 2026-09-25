import { expect, test, type Page } from '@playwright/test';
import { expectResults, FIXED_NOW, openApp, openFilterPanel, waitForMap } from './helpers';

/** The map is optional: when it cannot load or draw, the list and filters keep working. */

const cards = (page: Page) => page.locator('li[data-race-id]');

test.describe('map failures stay local to the map', () => {
  test('the map chunk failing to download (e.g. after a redeploy) leaves the list working', async ({ page }) => {
    const requests: string[] = [];
    await page.route(/\/assets\/MapView-[^/]+\.js$/, (route) => {
      requests.push(route.request().url());
      return route.fulfill({ status: 404, body: 'gone' });
    });
    await openApp(page);
    await expect(page.getByTestId('map-unavailable')).toContainText('The map could not load', { timeout: 15_000 });
    // One automatic reload to pick up a new deploy, then it gives up.
    expect(requests.length).toBe(2);
    await expectResults(page, 16);
    await expect(cards(page).first()).toBeVisible();
    await page.getByRole('button', { name: /^Full distance/ }).click();
    await expectResults(page, 9);
    // "In map area" needs the map.
    await openFilterPanel(page);
    await expect(page.getByRole('switch', { name: /In map area/ })).toBeDisabled();
  });

  test('a browser without WebGL 2 gets the list and a note instead of the map', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error -- simulate a browser with WebGL disabled
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      };
    });
    await openApp(page, '/?race=ironman-frankfurt-full');
    await expect(page.getByTestId('map-unavailable')).toContainText('WebGL 2');
    await expect(page.getByRole('heading', { level: 2, name: 'IRONMAN Frankfurt' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expectResults(page, 16);
  });
});

test('without a map, an "in map area" link falls back to all races and says the filter is off', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- simulate a browser with WebGL disabled
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    };
  });
  await openApp(page, '/?area=1&at=52.37,5.2,8');
  await expect(page.getByTestId('map-unavailable')).toBeVisible();
  await expectResults(page, 16);
  await expect(page).not.toHaveURL(/area=1/);
  await openFilterPanel(page);
  await expect(page.getByRole('switch', { name: /In map area/ })).toHaveAttribute('aria-checked', 'false');
});

test('a theme switch while the basemap is unreachable falls back and keeps markers in sync', async ({ page }) => {
  await openApp(page, '/', { theme: 'light' });
  await waitForMap(page);
  await page.route(/basemaps\.cartocdn\.com/, (route) => route.abort());
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.getByText('Basemap unavailable: showing races only')).toBeVisible({ timeout: 15_000 });
  // The races source came back with the fallback style: markers follow the filters.
  await openFilterPanel(page);
  await page
    .getByRole('group', { name: 'Region' })
    .getByRole('button', { name: /Oceania/ })
    .click();
  await expectResults(page, 1);
  await expect(page.locator('.tm-marker:not(.tm-selection)')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('.tm-marker[data-id="t100-wanaka-t100"]')).toHaveCount(1);
});

test('a tab left open past midnight moves "today" on', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T23:58:00') });
  await page.goto('/?sort=name&q=riviera');
  const card = page.locator('li[data-race-id="t100-french-riviera-t100"]');
  await expect(card).toContainText('in 2 days'); // Sun 27 Sep
  await page.clock.runFor(26 * 60 * 60 * 1000); // Sun 27 Sep, 01:58
  await expect(card).toContainText('today');
});

test('the tab title names the open race', async ({ page }) => {
  await openApp(page, '/?race=ironman-frankfurt-full');
  await expect(page).toHaveTitle('IRONMAN Frankfurt · Sun 27 Jun 2027 · TriMap');
  await page.keyboard.press('Escape');
  await expect(page).toHaveTitle(/^TriMap · /);
});

test('each race has a small page whose preview names it and forwards to the app', async ({ page, request }) => {
  const res = await request.get('/race/ironman-frankfurt-full/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<title>IRONMAN Frankfurt · Sun 27 Jun 2027 · TriMap</title>');
  expect(html).toMatch(/<meta property="og:title" content="IRONMAN Frankfurt · Full distance"/);
  // A replaced race has nothing to enter: its preview points at the successor instead.
  const replaced = await (await request.get('/race/challenge-wanaka-half/')).text();
  expect(replaced).toContain('No future edition announced');
  expect(replaced).toContain('Continues as T100 Wanaka.');
  expect(replaced).not.toContain('Open entry.');
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto('/race/ironman-frankfurt-full/');
  await expect(page).toHaveURL(/\/\?race=ironman-frankfurt-full$/);
  await expect(page.getByRole('heading', { level: 2, name: 'IRONMAN Frankfurt' })).toBeVisible();
});

test('a shared "in map area" search reopens the same map view and results', async ({ page }) => {
  // Zoomed in on the Netherlands: only the two Almere races are inside.
  await openApp(page, '/?area=1&at=52.37,5.2,8');
  await waitForMap(page);
  await expectResults(page, 2);
  await expect(cards(page).first()).toContainText('Challenge Almere-Amsterdam');
});

test('map markers show the edition that matches the search, and update in place', async ({ page }) => {
  await openApp(page, '/?q=kona');
  await waitForMap(page);
  const pin = page.locator('.tm-marker[data-id="ironman-kailua-kona-full"] button');
  await expect(pin).toHaveAttribute('aria-label', /Sat 10 Oct 2026/);
  // Same race, but a year in the search picks its (estimated) 2027 edition.
  await page.getByRole('searchbox').fill('kona 2027');
  await expect(pin).toHaveAttribute('aria-label', /≈ Oct 2027 · date TBA/);
  await expect(page.locator('.tm-marker[data-id="ironman-kailua-kona-full"] .tm-tip')).toContainText('≈ Oct 2027');
});

test('an "in map area" link with an open race keeps the shared view', async ({ page }) => {
  await openApp(page, '/?area=1&at=52.37,5.2,8&race=challenge-almere-amsterdam-full');
  await waitForMap(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Challenge Almere-Amsterdam' })).toBeVisible();
  await page.waitForTimeout(1500); // any camera move would have happened by now
  await expect(page).toHaveURL(/at=52\.37,5\.2,8/);
  await page.keyboard.press('Escape');
  await expectResults(page, 2);
});
