import { expect, test, type Page } from '@playwright/test';
import { expandSoon, expectResults, openApp, openFilterPanel, waitForMap } from './helpers';

/**
 * Registration status from the fixture status files (tests/fixtures/registration): the
 * IRONMAN file was checked on 24 Sep 2026 (fresh), the T100 file on 1 Aug 2026 (older than
 * 30 days on the frozen 25 Sep, so not shown).
 */

const card = (page: Page, id: string) => page.locator(`li[data-race-id="${id}"]`);
const badge = (page: Page, id: string) => card(page, id).getByTestId('registration-badge');

test.describe('registration status', () => {
  test('cards show a badge with the date it was checked; open entry and unknown statuses show none', async ({
    page,
  }) => {
    await openApp(page, '/?est=1');
    await expandSoon(page);
    await expect(badge(page, 'ironman-cozumel-full')).toHaveText('Sold out · as of 24 Sep');
    await expect(badge(page, 'ironman-cascais-half')).toHaveText('Registration closed · as of 24 Sep');
    await expect(badge(page, 'ironman-bahrain-half')).toHaveText('General entry sold out · as of 24 Sep');
    await expect(badge(page, 'ironman-south-africa-full')).toHaveText('Opens soon · as of 24 Sep');
    await expect(badge(page, 'ironman-cozumel-full')).toHaveAttribute(
      'title',
      /^Sold out as of 24 Sep 2026\. No entries left\.$/,
    );
    // Open entry needs no badge; Da Nang's status is about its 2026 edition, already held.
    await expect(badge(page, 'ironman-frankfurt-full')).toHaveCount(0);
    await expect(badge(page, 'ironman-da-nang-half')).toHaveCount(0);
    // The status is part of the card's accessible name.
    await expect(card(page, 'ironman-cozumel-full').locator('h4 button')).toHaveAttribute(
      'aria-label',
      /IRONMAN Cozumel, Full distance, Sold out as of 24 Sep 2026, /,
    );
  });

  test('a status older than 30 days is not shown, and the footer says so', async ({ page }) => {
    await openApp(page, '/');
    await expect(card(page, 't100-dubai-t100')).toBeVisible();
    await expect(badge(page, 't100-dubai-t100')).toHaveCount(0);
    const sources = page.getByTestId('registration-sources');
    await expect(sources).toContainText('IRONMAN and IRONMAN 70.3 from ironman.com, checked 24 Sep 2026');
    await expect(sources).toContainText(
      'T100 World Championship Tour from t100triathlon.com and the PTO entry platform, checked 1 Aug 2026 (too old to show)',
    );
    await expect(sources).toContainText('Races from other organisers show no status');
    await page.goto('/?race=t100-dubai-t100');
    await expect(page.getByRole('heading', { level: 2, name: 'T100 Dubai' })).toBeVisible();
    await expect(page.getByTestId('registration-row')).toHaveCount(0);
  });

  test('the race detail has a Registration row: status, date checked, what it means, official website', async ({
    page,
  }) => {
    await openApp(page, '/?race=ironman-cozumel-full');
    const detail = page.getByRole('dialog');
    const row = detail.getByTestId('registration-row');
    await expect(row).toContainText('Registration');
    await expect(row).toContainText('Sold out · as of 24 Sep 2026');
    await expect(row).toContainText('No entries left.');
    await expect(row.getByRole('link', { name: 'Official website' })).toHaveAttribute(
      'href',
      'https://www.ironman.com/races/im-cozumel',
    );
    await expect(detail.getByTestId('registration-badge')).toHaveText('Sold out · as of 24 Sep');
    await expect(detail.getByTestId('registration-source')).toHaveText(
      'Registration status: “Registration Sold Out” on the ironman.com race finder, checked Thu 24 Sep 2026.',
    );

    await page.goto('/?race=ironman-bahrain-half');
    await expect(detail.getByTestId('registration-row')).toContainText(
      'General entry sold out · as of 24 Sep 2026Charity or travel-package places may remain.',
    );
    await page.goto('/?race=ironman-frankfurt-full');
    await expect(detail.getByTestId('registration-row')).toContainText('Open · as of 24 Sep 2026You can still enter.');
    await expect(detail.getByTestId('registration-badge')).toHaveCount(0);
  });

  test('"Hide sold out" hides sold-out and closed races, keeps general entry sold out, and is in the URL', async ({
    page,
  }) => {
    await openApp(page, '/');
    await expectResults(page, 16);
    await openFilterPanel(page);
    const toggle = page.getByRole('switch', { name: /Hide sold out/ });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle.getByTestId('sold-out-count')).toHaveText('2');
    await toggle.click();
    await expectResults(page, 14);
    await expect(page).toHaveURL(/hidesold=1/);
    await expect(card(page, 'ironman-cozumel-full')).toHaveCount(0);
    await expect(card(page, 'ironman-cascais-half')).toHaveCount(0);
    await expect(card(page, 'ironman-bahrain-half')).toBeVisible();
    await expect(card(page, 'ironman-south-africa-full')).toBeVisible();
    // The stale T100 status does not count.
    await expect(card(page, 't100-dubai-t100')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('switch', { name: /Hide sold out/ })).toHaveAttribute('aria-checked', 'true');
    await expectResults(page, 14);
    // With the panel closed, the filter shows as a removable chip.
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('button', { name: 'Hide sold out: remove filter' }).click();
    await expectResults(page, 16);
    await expect(page).not.toHaveURL(/hidesold/);
  });

  test('the map tooltip shows the status', async ({ page }) => {
    await openApp(page, '/?region=latin-america');
    await waitForMap(page);
    const marker = page.locator('.tm-marker[data-id="ironman-cozumel-full"]');
    await expect(marker.locator('.tm-tip-reg')).toHaveText('Sold out · as of 24 Sep', { timeout: 15_000 });
    await expect(marker.locator('button')).toHaveAttribute('aria-label', /Sold out as of 24 Sep 2026/);
  });

  test('mobile: the badge fits the card on a 390px phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openApp(page, '/');
    const b = badge(page, 'ironman-cozumel-full');
    await b.scrollIntoViewIfNeeded();
    await expect(b).toBeVisible();
    const box = (await b.boundingBox())!;
    const cardBox = (await card(page, 'ironman-cozumel-full').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    // No horizontal scrolling.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await context.close();
  });
});
