import { expect, test, type Browser } from '@playwright/test';
import { expectResults, openApp, waitForMap } from './helpers';

async function phone(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  return { context, page: await context.newPage() };
}

test('mobile: Tab never lands on map controls hidden behind the list; the Map toggle comes first', async ({
  browser,
}) => {
  const { context, page } = await phone(browser);
  await openApp(page, '/?area=1'); // "In map area" mounts the map behind the list
  await waitForMap(page);
  // The hidden map is inert while the list is shown.
  await expect(page.getByRole('region', { name: 'Race map' })).toHaveAttribute('inert', '');
  const focused: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    focused.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return `${el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 30)}|${!!el?.closest('[inert]')}|${!!el?.closest('section[aria-label="Race map"]')}`;
      }),
    );
  }
  expect(focused.filter((f) => f.endsWith('|true'))).toEqual([]);
  // The Map / List toggle is reached right after the search bar, before the results.
  const toggleAt = focused.findIndex((f) => f.startsWith('Map|'));
  const firstCardAt = focused.findIndex((f) => /IRONMAN|Challenge|T100|Norseman|Embrunman/.test(f));
  expect(toggleAt).toBeGreaterThan(-1);
  expect(firstCardAt === -1 || toggleAt < firstCardAt).toBe(true);
  await context.close();
});

test('mobile: the race sheet opens tall from the list, drags down to a peek and closes', async ({ browser }) => {
  const { context, page } = await phone(browser);
  await openApp(page, '/?sort=name');
  await page.locator('li[data-race-id="ironman-frankfurt-full"] h4 button').click();
  const sheet = page.getByTestId('detail-sheet');
  await expect(sheet).toHaveAttribute('data-snap', 'full');
  // Wait until the sheet stops moving (slide-in, height transitions): the drag must start
  // on the handle where it finally is, also on a busy machine.
  const settle = async () => {
    let last = -1;
    await expect
      .poll(
        async () => {
          const h = Math.round((await sheet.boundingBox())?.height ?? 0);
          const top = Math.round((await sheet.boundingBox())?.y ?? 0);
          const stable = h === last;
          last = h;
          return (
            stable &&
            (await sheet.evaluate(
              (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
            )) === 0 &&
            top > 0
          );
        },
        { intervals: [100] },
      )
      .toBe(true);
  };
  await settle();
  const handle = page.getByTestId('sheet-handle');
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  // Drag down about 300px: full → peek.
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(x, (y += 30), { steps: 2 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute('data-snap', 'peek');
  await settle();
  // The handle is also a button for keyboard users.
  await handle.click();
  await expect(sheet).toHaveAttribute('data-snap', 'full');
  await handle.click();
  await expect(sheet).toHaveAttribute('data-snap', 'peek');
  await settle();
  // Dragging down from the peek closes the sheet.
  const peekBox = (await handle.boundingBox())!;
  y = peekBox.y + peekBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(x, (y += 30), { steps: 2 });
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/race=/);
  await context.close();
});

test('mobile: a race picked on the map opens as a peek, without the map controls on top', async ({ browser }) => {
  const { context, page } = await phone(browser);
  await openApp(page, '/?q=frankfurt');
  await page.getByRole('button', { name: /^Map$/ }).click();
  await waitForMap(page);
  await page.locator('.tm-marker[data-id="ironman-frankfurt-full"] .tm-pin').click({ force: true });
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-snap', 'peek');
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeHidden();
  await context.close();
});

test('mobile: the filter sheet announces the result count inside the dialog', async ({ browser }) => {
  const { context, page } = await phone(browser);
  await openApp(page);
  await expectResults(page, 16);
  await page.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: /^T100 distance/ }).click();
  await expect(sheet.locator('[aria-live="polite"]')).toHaveText('3 races');
  await context.close();
});

test('mobile: date presets wrap instead of overflowing at 320px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openApp(page);
  await page.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  const scroller = sheet.locator('.overflow-y-auto');
  const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await context.close();
});
