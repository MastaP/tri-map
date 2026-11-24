import { expect, test } from '@playwright/test';
import { FIXED_NOW, openApp } from './helpers';

/** The race calendar pages (races/), written at build time from the fixture data. */

test('a race calendar lists its races, links to them and opens the same search in the app', async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto('/races/europe/full-distance/');
  await expect(page.getByRole('heading', { level: 1, name: 'Full-distance triathlons in Europe' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Next date not announced yet' })).toBeVisible();
  // Each race links to its own page.
  await page.locator('.races').getByRole('link', { name: 'IRONMAN Frankfurt' }).click();
  await expect(page).toHaveURL(/\/race\/ironman-frankfurt-full\/$/);
  // ...which links back to the calendars it is on.
  await page.getByRole('link', { name: 'Full-distance triathlons in Europe' }).click();
  await expect(page).toHaveURL(/\/races\/europe\/full-distance\/$/);
  await page.getByRole('link', { name: 'Open these on the map' }).click();
  await expect(page).toHaveURL(/\/\?dist=full&region=europe$/);
  await expect(page.getByRole('button', { name: /^Full distance/ })).toHaveAttribute('aria-pressed', 'true');
});

test('the app links to the race calendars, and every calendar is in the index', async ({ page, request }) => {
  await openApp(page);
  await page.getByRole('link', { name: 'Race calendars' }).click();
  await expect(page).toHaveURL(/\/races\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Triathlon race calendars' })).toBeVisible();
  const links = await page.locator('.links a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(links.length).toBeGreaterThan(3);
  for (const href of links) expect((await request.get(href)).status(), href).toBe(200);
  // The sitemap lists them too.
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/races/europe/full-distance/</loc>');
});
