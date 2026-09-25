import { expect, test, type Browser, type Page } from '@playwright/test';
import { openApp, openFilterPanel, waitForMap } from './helpers';

/**
 * On touch screens (coarse pointers) every visible control is at least 44 × 44 px:
 * its own box, or the invisible hit area a ::before / ::after pseudo-element adds.
 *
 * Exceptions, on purpose:
 * - the month bars of the date histogram. They work like a range slider (tap or drag
 *   across months); 16+ months cannot each be 44px wide on a phone. The date presets and
 *   the range chip are the 44px way to pick dates.
 * - the credit links inside maplibre's map attribution ("© CARTO, © OpenStreetMap"):
 *   inline text in a third-party control, which stays a slim bar over the map (its "i"
 *   toggle does get a 44px hit area). The same credits are 44px links in the footer.
 */
const MIN = 44;

async function undersized(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const selector =
      'a[href], button, input, select, textarea, summary, [role="switch"], [role="button"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.closest('[inert]')) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-label^="Races per month"]')) continue; // the histogram (see above)
      if (el.closest('.maplibregl-ctrl-attrib-inner')) continue; // map credits (see above)
      const r = el.getBoundingClientRect();
      // Visually hidden (the skip link until it is focused).
      if (r.width < 2 || r.height < 2 || getComputedStyle(el).clipPath === 'inset(50%)') continue;
      let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom];
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.content === 'none' || cs.display === 'none' || cs.position !== 'absolute') continue;
        let cb: HTMLElement | null = el;
        while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
        if (!cb) continue;
        const c = cb.getBoundingClientRect();
        const px = (v: string) => parseFloat(v) || 0;
        left = Math.min(left, c.left + px(cs.left));
        top = Math.min(top, c.top + px(cs.top));
        right = Math.max(right, c.right - px(cs.right));
        bottom = Math.max(bottom, c.bottom - px(cs.bottom));
      }
      const w = right - left;
      const h = bottom - top;
      if (w < min - 0.5 || h < min - 0.5) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return out;
  }, MIN);
}

async function phone(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  return { context, page: await context.newPage() };
}

test('phone: every control is at least 44px', async ({ browser }) => {
  const { context, page } = await phone(browser);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

  // The list, with notes (hidden course info, dates not announced yet) and a search.
  await openApp(page, '/?when=next-year&bike=rolling&q=ironman');
  await expect(page.getByTestId('estimated-hidden-note')).toBeVisible();
  await expect(page.getByTestId('missing-course-note')).toBeVisible();
  expect(await undersized(page), 'list').toEqual([]);

  // The filter sheet, with a date range (its "Clear dates" button) and every section.
  await page.goto('/?from=2026-11&to=2027-02&bike=rolling');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  expect(await undersized(page), 'filter sheet').toEqual([]);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // The empty state.
  await page.goto('/?q=roth');
  await expect(page.getByText('No races match')).toBeVisible();
  expect(await undersized(page), 'empty state').toEqual([]);

  // Race details: links in running text, the "not announced yet" state, venue links.
  for (const id of [
    't100-wanaka-t100',
    'challenge-wanaka-half',
    'challenge-roth-full',
    'challenge-almere-amsterdam-full',
  ]) {
    await page.goto(`/?race=${id}`);
    await expect(page.getByTestId('detail-sheet')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await undersized(page), id).toEqual([]);
  }

  // The map with its controls, the legend and the markers.
  await page.goto('/');
  await page.getByRole('button', { name: /^Map$/ }).click();
  await waitForMap(page);
  await page.getByRole('button', { name: /Legend/ }).click();
  await page.waitForTimeout(500);
  expect(await undersized(page), 'map').toEqual([]);
  await context.close();
});

test('tablet: the side-by-side layout also gets 44px controls on touch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const page = await context.newPage();
  await openApp(page, '/?region=europe&q=challenge&est=1');
  await waitForMap(page);
  expect(await undersized(page), 'list with active filter chips').toEqual([]);
  await openFilterPanel(page);
  expect(await undersized(page), 'filter panel').toEqual([]);
  await page.goto('/?race=challenge-wanaka-half');
  await expect(page.getByRole('heading', { level: 2, name: 'Challenge Wanaka' })).toBeVisible();
  expect(await undersized(page), 'detail').toEqual([]);
  await context.close();
});

test('desktop with a mouse keeps its compact controls', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
  const height = async (name: string | RegExp) =>
    (await page.getByRole('button', { name }).first().boundingBox())!.height;
  expect(await height(/^Date/)).toBe(24);
  expect(await height('Share this search')).toBe(32);
  expect(await height('Light theme')).toBe(28);
  expect((await page.getByRole('link', { name: 'TriMap on GitHub' }).boundingBox())!.height).toBe(32);
});

test('the results toolbar fits on one line, with "Clear" and "Nearest", at every width', async ({ browser }) => {
  const cases = [
    { width: 320, touch: true },
    { width: 360, touch: true },
    { width: 390, touch: true },
    { width: 820, touch: true }, // tablet: 360px sidebar
    { width: 1024, touch: true },
    { width: 800, touch: false }, // mouse: 360px sidebar
  ];
  for (const { width, touch } of cases) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: touch && width < 700,
      hasTouch: touch,
    });
    const page = await context.newPage();
    await openApp(page, '/?when=next-year&sort=near');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    const overflow = await page.getByTestId('result-count').evaluate((el) => {
      const bar = el.closest('.sticky')!.getBoundingClientRect();
      const buttons = [...el.closest('.sticky')!.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
      return Math.max(...buttons.map((b) => b.right)) - bar.right;
    });
    expect(overflow, `${width}px ${touch ? 'touch' : 'mouse'}`).toBeLessThanOrEqual(0);
    await context.close();
  }
});
