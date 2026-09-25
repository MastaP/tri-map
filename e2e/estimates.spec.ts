import { expect, test, type Page } from '@playwright/test';
import { expandSoon, expectResults, openApp, openFilterPanel, waitForMap } from './helpers';

/**
 * Every date shown by default comes from an official source: estimated (projected)
 * editions appear only with "Estimated dates" on (?est=1).
 */

const cards = (page: Page) => page.locator('li[data-race-id]');
const card = (page: Page, id: string) => page.locator(`li[data-race-id="${id}"]`);

test('by default no estimated date appears in the list, histogram or counts', async ({ page }) => {
  await openApp(page);
  await expandSoon(page);
  // Challenge Roth's next date is not announced: it is left out, and the note says so.
  await expectResults(page, 16);
  await expect(page.getByTestId('result-count')).toContainText('of 17');
  await expect(card(page, 'challenge-roth-full')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('≈');
  await expect(page.getByRole('main')).not.toContainText('Estimated');
  await expect(page.getByTestId('estimated-hidden-note')).toHaveText('1 more race has no date announced yet.');
  // Counts: the Full tile, the brand legend, the histogram.
  await expect(page.getByRole('button', { name: /^Full distance .*, 9 races$/ })).toBeVisible();
  await openFilterPanel(page);
  const histogram = page.getByRole('group', { name: /^Races per month/ });
  await expect(histogram.getByRole('button', { name: 'July 2027: 1 race' })).toBeVisible(); // Norseman
  await expect(histogram.getByRole('button', { name: 'October 2027: 0 races' })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Estimated dates/ })).toHaveAttribute('aria-checked', 'false');

  // One click shows them, labelled as estimates.
  await page.getByRole('button', { name: 'Show estimated dates' }).click();
  await expectResults(page, 17);
  await expect(page).toHaveURL(/\?est=1$/);
  await expect(card(page, 'challenge-roth-full')).toContainText('≈ Jul 2027 · date TBA');
  await expect(page.getByRole('button', { name: /^Full distance .*, 10 races$/ })).toBeVisible();
  await expect(histogram.getByRole('button', { name: 'July 2027: 2 races' })).toBeVisible();
  await expect(histogram.getByRole('button', { name: 'October 2027: 2 races' })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Estimated dates/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('estimated-hidden-note')).toHaveCount(0);
  // Closed, the filter panel leaves a removable chip; "Clear" goes back to announced dates.
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: 'Estimated dates: remove filter' }).click();
  await expectResults(page, 16);
  await expect(page).not.toHaveURL(/est=/);
});

test('the map shows no estimated date by default', async ({ page }) => {
  // Frankfurt (announced) and Roth (estimated) are far enough apart for their own markers.
  await openApp(page, '/?q=germany');
  await waitForMap(page);
  const pin = (id: string) => page.locator(`.tm-marker[data-id="${id}"] .tm-pin`);
  await expect(pin('ironman-frankfurt-full')).toHaveCount(1, { timeout: 15_000 });
  await expect(pin('challenge-roth-full')).toHaveCount(0);
  await expect(page.locator('.tm-marker')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show estimated dates' }).click();
  await expect(pin('challenge-roth-full')).toHaveAttribute('aria-label', /≈ Jul 2027 · date TBA/, { timeout: 15_000 });
});

test('season planning only counts announced dates, and says how many are still to come', async ({ page }) => {
  // Kona, Cascais, Dubai and Cozumel have announced 2026 dates; their late-2027 editions
  // are projections. Only Bahrain has an announced date then.
  await openApp(page, '/?from=2027-10&to=2027-12');
  await expectResults(page, 1);
  await expect(card(page, 'ironman-bahrain-half')).toBeVisible();
  await expect(page.getByTestId('estimated-hidden-note')).toHaveText(
    '4 more races usually held in this period have no date announced yet.',
  );
  await page.getByRole('button', { name: 'Show estimated dates' }).click();
  await expectResults(page, 5);
  await expect(page).toHaveURL(/from=2027-10&to=2027-12&est=1/);

  await page.goto('/?when=next-year');
  await expectResults(page, 11);
  await expect(page.getByTestId('estimated-hidden-note')).toHaveText(
    '6 more races usually held in this period have no date announced yet.',
  );
  await openFilterPanel(page);
  await expect(page.getByTestId('time-summary')).toHaveText('2027 · 11 races');
});

test('the empty state offers estimated dates when that is what is missing', async ({ page }) => {
  await openApp(page, '/?q=roth');
  await expect(page.getByText('No races match')).toBeVisible();
  await expect(page.getByTestId('estimated-hidden')).toHaveText('1 race has no date announced yet.');
  await page.getByRole('button', { name: /^Show estimated dates/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, 'challenge-roth-full')).toBeVisible();

  // A year in the search: Kona's 2027 edition is only a projection.
  await page.goto('/?q=kona+2027');
  await expect(page.getByTestId('estimated-hidden')).toHaveText(
    '1 race usually held in this period has no date announced yet.',
  );
});

test('old links: est=0 is the default now, est=1 shows estimates', async ({ page }) => {
  await openApp(page, '/?dist=full&est=0');
  await expectResults(page, 9);
  await expect(page).toHaveURL(/\?dist=full$/);
  await page.goto('/?est=1');
  await expectResults(page, 17);
});

test('the detail of a race without an announced date says so and offers the estimate', async ({ page }) => {
  await openApp(page, '/?race=challenge-roth-full');
  const detail = page.getByRole('dialog', { name: 'Challenge Roth' });
  const next = detail.getByRole('region', { name: 'Next race' });
  await expect(next).toContainText('Next date not announced yet');
  await expect(next.getByTestId('next-not-announced')).toHaveText('Last held Sun 5 Jul 2026 · Show estimated dates');
  await expect(detail).not.toContainText('≈');
  await expect(detail.getByRole('button', { name: /Add to calendar/ })).toBeDisabled();
  await expect(page).toHaveTitle('Challenge Roth · TriMap');

  await next.getByRole('button', { name: 'Show estimated dates' }).click();
  await expect(next).toContainText('≈ July 2027');
  await expect(detail.getByText('Estimated', { exact: true })).toBeVisible(); // the editions list
  await expect(page).toHaveURL(/est=1&race=challenge-roth-full/);
  await expect(page).toHaveTitle('Challenge Roth · ≈ Jul 2027 · TriMap');
});

test('a starred race without an announced date still counts when another filter hides it', async ({ page }) => {
  await openApp(page, '/?est=1');
  await page.getByRole('button', { name: 'Add Challenge Roth to shortlist' }).click();
  await page.getByRole('button', { name: 'Add IRONMAN Frankfurt to shortlist' }).click();
  // Estimated dates off, and a region that hides both starred races.
  await page.goto('/?region=latin-america&star=1');
  await expect(page.getByTestId('starred-hidden-note')).toHaveText('2 starred races are hidden by your other filters.');
  await page.getByRole('button', { name: 'Show all starred' }).click();
  // Frankfurt is back; Roth waits for its date, and the note says so.
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, 'ironman-frankfurt-full')).toBeVisible();
  await expect(page.getByTestId('estimated-hidden-note')).toHaveText('1 more race has no date announced yet.');
  await expect(page.getByTestId('starred-hidden-note')).toHaveCount(0);
});
