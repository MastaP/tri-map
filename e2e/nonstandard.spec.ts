import { expect, test, type Page } from '@playwright/test';
import { expectResults, openApp, waitForMap } from './helpers';

/** Near-standard races (Celtman: 3.4 / 202 / 41 km) show their official km and a tag. */

const card = (page: Page, id: string) => page.locator(`li[data-race-id="${id}"]`);
const CELTMAN = 'independent-celtman-full';

test('the card tags a near-standard race, listing the real km', async ({ page }) => {
  await openApp(page, '/?sort=name');
  const tag = card(page, CELTMAN).getByTestId('non-standard');
  await expect(tag).toHaveText('Non-standard distance');
  await expect(tag).toHaveAttribute('title', 'Non-standard distance: 3.4 km swim, 202 km bike, 41 km run');
  await expect(card(page, CELTMAN).getByRole('button', { name: /^Celtman/ })).toHaveAttribute(
    'aria-label',
    /Full distance, non-standard distance 3\.4 \/ 202 \/ 41 km,/,
  );
  // The distance badge's tooltip gives the official km too.
  await expect(card(page, CELTMAN).getByTitle(/^Full distance: /)).toHaveAttribute(
    'title',
    'Full distance: 3.4 km swim, 202 km bike, 41 km run',
  );
  // Only that race is tagged.
  await expect(page.getByTestId('non-standard')).toHaveCount(1);
});

test('the detail shows the official km instead of the standard ones', async ({ page }) => {
  await openApp(page, `/?race=${CELTMAN}`);
  const detail = page.getByRole('dialog', { name: 'Celtman Extreme Scottish Triathlon' });
  await expect(detail.getByTestId('non-standard')).toHaveText('Non-standard distance');
  const course = detail.getByRole('region', { name: 'Course details' });
  await expect(course).toContainText('3.4km');
  await expect(course).toContainText('202km');
  await expect(course).toContainText('41km');
  await expect(course).not.toContainText('180km');
  await expect(course.getByTestId('course-total')).toHaveText(
    'Full distance · 246.4 km total · standard 3.8 / 180 / 42.2 km',
  );

  // A standard race keeps the standard km and has no tag.
  await page.goto('/?race=ironman-frankfurt-full');
  await expect(page.getByRole('region', { name: 'Course details' }).getByTestId('course-total')).toHaveText(
    'Full distance · 226 km total',
  );
  await expect(page.getByRole('dialog', { name: 'IRONMAN Frankfurt' }).getByTestId('non-standard')).toHaveCount(0);
});

test('the map tooltip and marker label name the real km', async ({ page }) => {
  await openApp(page, '/?q=celtman');
  await waitForMap(page);
  const marker = page.locator(`.tm-marker[data-id="${CELTMAN}"]`);
  await expect(marker.locator('.tm-tip-course')).toHaveText('Non-standard distance: 3.4 / 202 / 41 km', {
    timeout: 15_000,
  });
  await expect(marker.locator('button')).toHaveAttribute('aria-label', /Non-standard distance: 3\.4 \/ 202 \/ 41 km/);
  await marker.hover();
  await expect(marker.locator('.tm-tip')).toBeVisible();
  await expect(page.locator('.tm-tip-course')).toHaveCount(1);
});

test('the distance filter still works by category', async ({ page }) => {
  await openApp(page, '/?dist=full');
  await expectResults(page, 9);
  await expect(card(page, CELTMAN)).toBeVisible();
  await page.goto('/?dist=half');
  await expect(card(page, CELTMAN)).toHaveCount(0);
});
