import { expect, test, type Page } from '@playwright/test';
import { openApp, openFilterPanel, waitForMap } from './helpers';

/**
 * A shared "In map area" search carries the map area (bbox=west,south,east,north), so a
 * screen of another size or shape shows the same races.
 */

const listedIds = (page: Page) =>
  page.locator('li[data-race-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-race-id')).sort());

const bboxOf = (url: string) => new URL(url).searchParams.get('bbox');

test('turning on "In map area" puts the map area in the URL', async ({ page }) => {
  await openApp(page);
  await waitForMap(page);
  await openFilterPanel(page);
  await page.getByRole('switch', { name: /In map area/ }).click();
  await expect(page).toHaveURL(/area=1&bbox=-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
  await expect(page).not.toHaveURL(/at=/);
});

test('a desktop "in map area" link shows the same races on a phone', async ({ browser }) => {
  // On a wide desktop map, zoom 6 over the Low Countries and western Germany.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await desktop.newPage();
  await openApp(dPage, '/?area=1&at=51.2,6.9,6&sort=name');
  await waitForMap(dPage);
  await expect(dPage).toHaveURL(/bbox=/);
  const shared = dPage.url();
  const expected = await listedIds(dPage);
  // Almere (full and half) and Frankfurt: more than a phone would show around that centre.
  expect(expected).toEqual([
    'challenge-almere-amsterdam-full',
    'challenge-almere-amsterdam-half',
    'ironman-frankfurt-full',
  ]);
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  await openApp(page, `/${new URL(shared).search}`);
  await waitForMap(page);
  await page.waitForTimeout(800); // the first camera has settled
  expect(await listedIds(page)).toEqual(expected);
  // The phone keeps the same box in its URL (re-sharing gives the same search).
  expect(bboxOf(page.url())).toBe(bboxOf(shared));

  // Once the viewer moves the map, the list follows what they see.
  await page.getByRole('button', { name: /^Map$/ }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => bboxOf(page.url()), { timeout: 10_000 }).not.toBe(bboxOf(shared));
  await page.getByRole('button', { name: /^List/ }).click();
  expect((await listedIds(page)).length).toBeGreaterThan(3);
  await phone.close();
});
