import { expect, test, type Page } from '@playwright/test';
import { expectResults, openApp, waitForMap } from './helpers';

/**
 * Shorter triathlons, duathlons and time trials (the Dutch fixtures: DTS Zandvoort sprint,
 * RBR Almere Long 10 / 56 / 10 km, Time Trial Almere 42 km).
 */

const card = (page: Page, id: string) => page.locator(`li[data-race-id="${id}"]`);
const DUATHLON = 'independent-rbr-almere-long-duathlon';
const TIME_TRIAL = 'independent-tt-almere-42k-time-trial';
const SPRINT = 'independent-dts-zandvoort-sprint';

test('each category has a distance tile with its count, and filters by it', async ({ page }) => {
  await openApp(page);
  const tiles = page.getByRole('group', { name: 'Distance' });
  await expect(tiles.getByRole('button', { name: 'Duathlon (run, bike, run), 1 races' })).toBeVisible();
  await expect(tiles.getByRole('button', { name: 'Bike time trial (bike only), 1 races' })).toBeVisible();
  await expect(tiles.getByRole('button', { name: 'Sprint distance (0.75 / 20 / 5 km), 1 races' })).toBeVisible();
  await expect(tiles.getByRole('button', { name: 'Olympic distance (1.5 / 40 / 10 km), 0 races' })).toBeVisible();
  await expect(
    tiles.getByRole('button', { name: 'Off-road triathlon (swim, mountain bike, trail run), 0 races' }),
  ).toBeVisible();

  await tiles.getByRole('button', { name: /^Duathlon/ }).click();
  await expect(page).toHaveURL(/dist=duathlon/);
  await expectResults(page, 1);
  await expect(card(page, DUATHLON)).toBeVisible();

  await tiles.getByRole('button', { name: /^Bike time trial/ }).click();
  await expect(page).toHaveURL(/dist=duathlon,time-trial/);
  await expectResults(page, 2);
});

test('cards name a duathlon or time trial with its own km', async ({ page }) => {
  await openApp(page, '/?q=almere');
  await expect(card(page, DUATHLON).getByText('Duathlon · 10/56/10 km')).toBeVisible();
  await expect(card(page, TIME_TRIAL).getByText('Time trial · 42 km')).toBeVisible();
  await expect(card(page, DUATHLON).getByRole('button', { name: /^RBR Almere Long/ })).toHaveAttribute(
    'aria-label',
    /Duathlon, 10 \/ 56 \/ 10 km,/,
  );
  // Their km are not a deviation from a standard.
  await expect(page.getByTestId('non-standard')).toHaveCount(0);
  await expect(card(page, SPRINT)).toHaveCount(0);
  await page.getByRole('searchbox').fill('zandvoort');
  await expect(card(page, SPRINT).getByText('Sprint', { exact: true })).toBeVisible();
});

test('searching a sport finds races whose name does not say it', async ({ page }) => {
  await openApp(page, '/?q=duathlon');
  await expectResults(page, 1);
  await expect(card(page, DUATHLON)).toBeVisible();
  await page.getByRole('searchbox').fill('time trial');
  await expectResults(page, 1);
  await expect(card(page, TIME_TRIAL)).toBeVisible();
});

test('the detail lists a duathlon run / bike / run and a time trial bike only', async ({ page }) => {
  await openApp(page, `/?race=${DUATHLON}`);
  let course = page.getByRole('region', { name: 'Course details' });
  for (const text of ['10km', 'Run 1', '56km', 'Bike', 'Run 2']) await expect(course).toContainText(text);
  await expect(course).not.toContainText('Swim');
  await expect(course.getByTestId('course-total')).toHaveText('Duathlon · 76 km total');

  await page.goto(`/?race=${TIME_TRIAL}`);
  course = page.getByRole('region', { name: 'Course details' });
  await expect(course).toContainText('42km');
  await expect(course).toContainText('Flat');
  await expect(course).not.toContainText(/Swim|Run/);
  await expect(course.getByTestId('course-total')).toHaveText('Bike time trial · 42 km total');
});

test('the map tooltip and tag say what a duathlon is', async ({ page }) => {
  await openApp(page, '/?q=rbr');
  await waitForMap(page);
  const marker = page.locator(`.tm-marker[data-id="${DUATHLON}"]`);
  await expect(marker.locator('.tm-tip-course')).toHaveText('Duathlon: 10 / 56 / 10 km', { timeout: 15_000 });
  await expect(marker.locator('.tm-tag')).toHaveText('Du');
});
