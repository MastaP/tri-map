import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp, waitForMap } from './helpers';

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // maplibre's own canvas/attribution are third-party chrome.
    .exclude('.maplibregl-ctrl-attrib')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map(
    (v) =>
      `${v.id}: ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`no serious axe violations (${theme})`, async ({ page }) => {
    await openApp(page, '/', { theme });
    await waitForMap(page);
    await audit(page);
  });

  test(`no serious axe violations in the race detail (${theme})`, async ({ page }) => {
    await openApp(page, '/?race=ironman-frankfurt-full', { theme });
    await waitForMap(page);
    await audit(page);
  });
}
