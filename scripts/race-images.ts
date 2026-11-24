/**
 * Writes the share image of every race (race/<id>/og.jpg, see scripts/raceImage.ts) into
 * a built site, with Playwright's Chromium. Run after `vite build` by the deploy workflow:
 *
 *   npm run race-images            # into dist/
 *   npm run race-images -- out/ --only ironman-frankfurt-full,challenge-roth-full
 *
 * Uses the same data as the build (VITE_RACE_DATA selects the fixtures) and the site URL's
 * host for the corner label (VITE_SITE_URL, else "trimap.live").
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { attachRegistration } from '../src/data/registration.ts';
import { validateRaceFiles } from '../src/data/validate.ts';
import { validateRegistrationFiles } from '../src/data/validateRegistration.ts';
import { localToday } from '../src/lib/dates.ts';
import { RACE_IMAGE, raceImageHtml } from './raceImage.ts';
import { dataDirFor, readRaceFiles, readRegistrationFiles, registrationDirFor } from './raceFiles.ts';
import { loadWorld } from './regionMap.ts';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1]?.split(',').filter(Boolean)) : null;
if (only && !only.size) throw new Error('--only needs a comma-separated list of race ids');
const positional = args.filter((a, i) => !a.startsWith('--') && (onlyAt < 0 || i !== onlyAt + 1));
const outDir = positional[0] ?? join(root, 'dist');

const source = process.env.VITE_RACE_DATA;
const today = localToday();
const validated = validateRaceFiles(readRaceFiles(dataDirFor(source)), today).races;
const registration = validateRegistrationFiles(
  readRegistrationFiles(registrationDirFor(source)),
  validated,
  today,
).data;
const races = attachRegistration(validated, registration, today);
const selected = only ? races.filter((r) => only.has(r.id)) : races;
if (only && selected.length !== only.size) {
  const known = new Set(races.map((r) => r.id));
  throw new Error(`Unknown race id(s): ${[...only].filter((id) => !known.has(id)).join(', ')}`);
}

const world = loadWorld(readFileSync(join(root, 'node_modules/world-atlas/countries-50m.json'), 'utf8'));
const dataUrl = (path: string, type: string) => `data:${type};base64,${readFileSync(path).toString('base64')}`;
const fonts = {
  inter: dataUrl(
    join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'),
    'font/woff2',
  ),
  barlow: dataUrl(
    join(root, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'),
    'font/woff2',
  ),
};
const flag = (country: string) => {
  const path = join(root, 'node_modules/flag-icons/flags/4x3', `${country.toLowerCase()}.svg`);
  return existsSync(path) ? dataUrl(path, 'image/svg+xml') : undefined;
};
const siteUrl = process.env.VITE_SITE_URL;
const host = siteUrl ? new URL(siteUrl).host : 'trimap.live';

const browser = await chromium.launch();
try {
  const queue = [...selected];
  const worker = async () => {
    const page = await browser.newPage({ viewport: RACE_IMAGE });
    for (let race = queue.shift(); race; race = queue.shift()) {
      await page.setContent(raceImageHtml(race, { today, races, world, host, flag: flag(race.country), fonts }));
      await page.waitForSelector('body[data-ready]');
      if ((await page.getAttribute('body', 'data-ready')) !== '1') {
        throw new Error(`The share image of ${race.id} does not fit in ${RACE_IMAGE.width} × ${RACE_IMAGE.height}`);
      }
      const dir = join(outDir, 'race', race.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'og.jpg'), await page.screenshot({ type: 'jpeg', quality: 85 }));
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: 4 }, worker));
} finally {
  await browser.close();
}
console.log(`Wrote ${selected.length} race images to ${join(outDir, 'race')}/<id>/og.jpg`);
