/**
 * Renders the share image (public/og-image.png) from scripts/ogImage.ts with Playwright's
 * Chromium. Run by hand after a brand or its glyph changes: `npm run og-image`, check the
 * PNG, commit it.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ogImageHtml } from './ogImage.ts';

const root = join(import.meta.dirname, '..');
const font = (path: string) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'node_modules', path)).toString('base64')}`;

const html = ogImageHtml({
  fonts: {
    inter: font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'),
    barlow: font('@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'),
    barlowItalic: font('@fontsource/barlow-condensed/files/barlow-condensed-latin-700-italic.woff2'),
  },
});

const out = join(root, 'public', 'og-image.png');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
} finally {
  await browser.close();
}
console.log(`Wrote ${out}`);
