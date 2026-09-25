import { expect, test, type Page } from '@playwright/test';
import { expandSoon, expectResults, FIXED_NOW, openApp, openFilterPanel, waitForMap } from './helpers';

/** Age-grouper features: entry type, course profile, successor links, T100 series, nearest sort. */

const cards = (page: Page) => page.locator('li[data-race-id]');
const card = (page: Page, id: string) => page.locator(`li[data-race-id="${id}"]`);
const detailHeading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });

test.describe('entry type', () => {
  test('qualifier-only and ballot races carry a badge; "Open entry only" hides them', async ({ page }) => {
    await openApp(page);
    await expandSoon(page);
    await expect(card(page, 'ironman-kailua-kona-full')).toContainText('Qualifier only');
    await expect(card(page, 'independent-norseman-full')).toContainText('Ballot');
    await expect(card(page, 'ironman-cozumel-full')).not.toContainText(/Qualifier only|Ballot/);

    await openFilterPanel(page);
    await page.getByRole('switch', { name: /Open entry only/ }).click();
    await expectResults(page, 14);
    await expect(card(page, 'ironman-kailua-kona-full')).toHaveCount(0);
    await expect(card(page, 'independent-norseman-full')).toHaveCount(0);
    await expect(page).toHaveURL(/open=1/);

    await page.reload();
    // The panel stays open across reloads; closed, the filter shows as a removable chip.
    await expect(page.getByRole('switch', { name: /Open entry only/ })).toHaveAttribute('aria-checked', 'true');
    await expectResults(page, 14);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByRole('button', { name: 'Open entry only: remove filter' })).toBeVisible();
  });

  test('a pro tour final at an open race is a quiet tag, not a "qualify first" badge', async ({ page }) => {
    // Kona needs a qualifying slot: its World Championship title is prominent.
    await openApp(page, '/?race=ironman-kailua-kona-full');
    const detail = page.getByRole('dialog');
    await expect(detail.getByTitle('IRONMAN World Championship: qualifier only')).toBeVisible();
    // A regional title at an open race stays quiet.
    await page.goto('/?race=ironman-frankfurt-full');
    await expect(detail.getByTitle('IRONMAN European Championship', { exact: true })).toBeVisible();
    await expect(detail.getByTitle(/qualifier only/)).toHaveCount(0);
  });

  test('the detail explains how to get a start', async ({ page }) => {
    await openApp(page, '/?race=ironman-kailua-kona-full');
    await expect(detailHeading(page, 'IRONMAN World Championship')).toBeVisible();
    await expect(page.getByText('Qualifier only: you need a qualifying slot')).toBeVisible();
  });

  test('the map tooltip shows the entry badge', async ({ page }) => {
    await openApp(page, '/?region=europe');
    await waitForMap(page);
    const tip = page.locator('.tm-marker[data-id="independent-norseman-full"] .tm-tip-entry');
    await expect(tip).toHaveText('Ballot', { timeout: 15_000 });
    await expect(page.locator('.tm-marker[data-id="independent-norseman-full"] button')).toHaveAttribute(
      'aria-label',
      /Ballot/,
    );
  });
});

test.describe('course profile', () => {
  test('bike/run filters drop races without course info, say how many and can list them', async ({ page }) => {
    await openApp(page);
    await openFilterPanel(page);
    const bike = page.getByRole('group', { name: 'Bike course' });
    await bike.getByRole('button', { name: /^Bike course: Flat/ }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect(page).toHaveURL(/bike=flat/);
    await expect(page.getByTestId('missing-course-note')).toHaveText(
      '3 races hidden: no course profile in our data yet.',
    );

    // "Show them" lists the hidden races in their own group, below the results.
    await page.getByRole('button', { name: 'Show them' }).click();
    const unknown = page.getByRole('list', { name: 'Races without a course profile' });
    await expect(unknown.locator('li[data-race-id]')).toHaveCount(3);
    await expect(unknown).toContainText('T100 Dubai');
    await expectResults(page, 3);

    await page
      .getByRole('group', { name: 'Run course' })
      .getByRole('button', { name: /^Run course: Flat/ })
      .click();
    await expect(page).toHaveURL(/bike=flat&run=flat/);
    await expectResults(page, 3);

    await page.getByRole('button', { name: 'Clear course filter' }).click();
    await expectResults(page, 16);
    await expect(page.getByTestId('missing-course-note')).toHaveCount(0);
  });

  test('races listed for a missing course profile show the edition inside the date range', async ({ page }) => {
    // T100 Dubai: next edition Nov 2026, but the range asks for late 2027.
    await openApp(page, '/?bike=flat&from=2027-10&to=2027-12');
    await page.getByRole('button', { name: 'Show them' }).click();
    const dubai = page.getByRole('list', { name: 'Races without a course profile' }).locator('li', {
      hasText: 'T100 Dubai',
    });
    await expect(dubai).toContainText('≈ Nov 2027');
    await expect(dubai).toContainText('(next: Nov 2026)');
  });

  test('a shared link restores the course filter', async ({ page }) => {
    await openApp(page, '/?bike=hilly,mountainous');
    await expectResults(page, 4);
    await openFilterPanel(page);
    await expect(page.getByRole('button', { name: /^Bike course: Hilly/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Bike course: Flat/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the detail shows swim type and bike / run profiles', async ({ page }) => {
    await openApp(page, '/?race=independent-embrunman-full');
    const course = page.getByRole('region', { name: 'Course details' });
    await expect(course).toContainText('Lake');
    await expect(course).toContainText('Bike course: Mountainous');
    await expect(course).toContainText('Run course: Hilly');

    await page.goto('/?race=t100-dubai-t100');
    await expect(page.getByRole('region', { name: 'Course details' })).toContainText('Bike course: Not listed yet');
  });
});

test.describe('successor and non-recurring races', () => {
  test('a replaced race links to its successor and back', async ({ page }) => {
    await openApp(page);
    // The replaced race is not listed…
    await expect(card(page, 'challenge-wanaka-half')).toHaveCount(0);
    await expect(card(page, 't100-wanaka-t100')).toContainText('T100 Challenger');

    // …but a deep link still opens it.
    await page.goto('/?race=challenge-wanaka-half');
    await expect(detailHeading(page, 'Challenge Wanaka')).toBeVisible();
    await expect(page.getByText('No future edition announced')).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to calendar/ })).toBeDisabled();
    await page.getByRole('button', { name: /Continues as T100 Wanaka from 2027/ }).click();

    await expect(page).toHaveURL(/race=t100-wanaka-t100/);
    await expect(detailHeading(page, 'T100 Wanaka')).toBeVisible();
    await expect(page.getByText('T100 · 100 km').first()).toBeVisible();
    await page.getByRole('button', { name: 'Formerly Challenge Wanaka' }).click();
    await expect(page).toHaveURL(/race=challenge-wanaka-half/);
  });

  test('a one-off race with only past editions opens from a link but is never listed', async ({ page }) => {
    await openApp(page, '/?race=ironman-nice-world-championship-half');
    await expect(detailHeading(page, 'IRONMAN 70.3 World Championship')).toBeVisible();
    await expect(page.getByText('No future edition announced')).toBeVisible();
    await expect(page.getByText('Last held Sun 13 Sep 2026')).toBeVisible();

    await page.goto('/?when=next-year&q=world');
    await expect(card(page, 'ironman-nice-world-championship-half')).toHaveCount(0);
    await page.goto('/?from=2026-09&to=2026-09');
    await expectResults(page, 1); // only T100 French Riviera, not the 70.3 WC held on 13 Sep
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, 'ironman-nice-world-championship-half')).toHaveCount(0);
  });

  test('searching a former name finds the race that took over', async ({ page }) => {
    await openApp(page, '/?q=challenge+wanaka');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('T100 Wanaka');
  });
});

test.describe('nearest sort', () => {
  test('uses the viewer location once they pick "Nearest"', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      geolocation: { latitude: 50.11, longitude: 8.68 }, // Frankfurt
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    await openApp(page);
    await expect(page.getByTestId('distance-away')).toHaveCount(0);
    await page.getByRole('button', { name: /^Nearest/ }).click();
    await expect(page.getByText('Distances from your location.')).toBeVisible();
    await expect(cards(page).first()).toHaveAttribute('data-race-id', 'ironman-frankfurt-full');
    await expect(cards(page).nth(1)).toHaveAttribute('data-race-id', 'challenge-roth-full');
    await expect(cards(page).nth(1).getByTestId('distance-away')).toHaveText('· 200 km away');
    await expect(page).toHaveURL(/sort=near/);

    // Back to date order hides the distances.
    await page.getByRole('button', { name: /^Date/ }).click();
    await expect(page.getByTestId('distance-away')).toHaveCount(0);
    await context.close();
  });

  test('falls back to the map centre when location is not shared', async ({ page }) => {
    await openApp(page);
    await waitForMap(page);
    await page.getByRole('button', { name: /^Nearest/ }).click();
    await expect(
      page.getByText(/Location (not shared|unavailable), so distances are from the centre of the map/),
    ).toBeVisible();
    await expect(page.getByTestId('distance-away').first()).toHaveText(/km away/);
    await expect(page.getByRole('button', { name: 'Try my location again' })).toBeVisible();
    // The map marks the point distances are measured from.
    await expect(page.getByTestId('center-mark')).toBeVisible();
  });

  test('a location prompt that never answers stops "finding" and offers a retry', async ({ page }) => {
    // Some browsers never call back when the permission prompt is dismissed or ignored.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: () => {}, watchPosition: () => 0, clearWatch: () => {} },
      });
    });
    await page.clock.install({ time: FIXED_NOW });
    await page.goto('/');
    await page.getByRole('button', { name: /^Nearest/ }).click();
    await expect(page.getByText(/Finding your location/)).toBeVisible();
    await expect(page.getByRole('button', { name: /my location/ })).toHaveCount(0);
    await page.clock.runFor(31_000);
    await expect(page.getByText(/Finding your location/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try my location again' })).toBeVisible();
  });

  test('a late answer to an earlier location request does not replace a newer one', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: PositionCallback[] = [];
      (window as unknown as { geoCalls: PositionCallback[] }).geoCalls = calls;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (ok: PositionCallback) => calls.push(ok),
          watchPosition: () => 0,
          clearWatch: () => {},
        },
      });
    });
    await page.clock.install({ time: FIXED_NOW });
    await page.goto('/');
    await page.getByRole('button', { name: /^Nearest/ }).click();
    await page.clock.runFor(31_000); // the first request times out…
    await page.getByRole('button', { name: 'Try my location again' }).click();
    const answer = (i: number, latitude: number, longitude: number) =>
      page.evaluate(
        ([i, latitude, longitude]) =>
          (window as unknown as { geoCalls: PositionCallback[] }).geoCalls[i]!({
            coords: { latitude, longitude },
          } as GeolocationPosition),
        [i, latitude, longitude] as const,
      );
    await answer(1, 48.14, 11.58); // …the retry answers: Munich
    await answer(0, -33.87, 151.21); // …then the first one, late: Sydney
    await expect(page.getByText('Distances from your location.')).toBeVisible();
    await expect(cards(page).first()).toHaveAttribute('data-race-id', 'challenge-roth-full');
  });

  test('a shared ?sort=near link does not ask for location on load', async ({ page }) => {
    await openApp(page, '/?sort=near');
    await waitForMap(page);
    await expect(page.getByText(/^Distances from the centre of the map/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
  });
});

test('mobile: new filters fit and work at 390px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openApp(page, '/?open=1&bike=flat,rolling&sort=name');
  // Nothing overflows horizontally.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: /^Run course: Rolling/ }).click();
  await expect(sheet.getByRole('button', { name: /Show 1 race$/ })).toBeVisible();
  const overflow = await sheet.evaluate((el) => {
    const w = el.getBoundingClientRect().right;
    return [...el.querySelectorAll('button, h3, span')].some((n) => n.getBoundingClientRect().right > w + 0.5);
  });
  expect(overflow).toBe(false);
  await context.close();
});
