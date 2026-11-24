import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calendarsFor,
  landingHubHtml,
  landingPageHtml,
  landingPages,
  relatedPages,
  yearsText,
  type LandingPage,
} from '../../scripts/landingPages.ts';
import { racePageHtml } from '../../scripts/racePages.ts';
import { loadWorld } from '../../scripts/regionMap.ts';
import { sitemapXml } from '../../scripts/sitemap.ts';
import { attachRegistration, type RegistrationData } from '../../src/data/registration.ts';
import type { Race } from '../../src/data/types.ts';
import { DEFAULT_FILTERS, filterRaces } from '../../src/lib/filters.ts';
import { normalizeText } from '../../src/lib/search.ts';
import { parseUrlState, serializeUrlState } from '../../src/lib/urlState.ts';
import { fixtureRaces, fixtureRegistrationFiles, TODAY } from './helpers.ts';

const SITE = 'https://x.github.io/tri-map/';
const registration = Object.fromEntries(
  fixtureRegistrationFiles().map((f) => [f.name.replace(/\.json$/, ''), JSON.parse(f.text)]),
) as RegistrationData;
const races = attachRegistration(fixtureRaces(), registration, TODAY);
const race = (id: string) => races.find((r) => r.id === id)!;
const pages = landingPages(races, TODAY);
const page = (path: string) => pages.find((p) => p.path === path)!;
const world = loadWorld(
  readFileSync(join(import.meta.dirname, '../../node_modules/world-atlas/countries-50m.json'), 'utf8'),
);
const html = (path: string, list: readonly LandingPage[] = pages) =>
  landingPageHtml(
    list.find((p) => p.path === path)!,
    list,
    { siteUrl: SITE, today: TODAY, world },
  );
/** The text of the page body, tags (and the map) dropped. */
const bodyText = (doc: string) =>
  doc
    .slice(doc.indexOf('<body>'))
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
/** The races the app lists for a page's "Open these on the map" link. */
const appRaces = (p: LandingPage, all: readonly Race[] = races) => {
  const qs = serializeUrlState({ filters: { ...DEFAULT_FILTERS, ...p.filters }, raceId: null, bounds: null });
  return filterRaces(all, parseUrlState(`?${qs}`).filters, { today: TODAY, bounds: null, shortlist: new Set() });
};

describe('race calendar pages', () => {
  it('make a page for each distance, series, region and country with enough races', () => {
    expect(pages.map((p) => p.path)).toEqual([
      'full-distance',
      'half-distance',
      't100',
      'ironman',
      'europe',
      'europe/full-distance',
      'netherlands',
    ]);
    // One sprint race is not a calendar.
    expect(pages.some((p) => p.distance === 'sprint')).toBe(false);
    expect(page('netherlands').title).toBe('Triathlons, duathlons and time trials in the Netherlands');
    expect(page('europe/full-distance').title).toBe('Full-distance triathlons in Europe');
  });

  it('list the races the app opens for "Open these on the map", and those with no date yet after them', () => {
    for (const p of pages) {
      const dated = p.races.filter((r) => !r.nextEdition!.estimated);
      expect(
        appRaces(p)
          .map((r) => r.id)
          .sort(),
        p.path,
      ).toEqual(dated.map((r) => r.id).sort());
    }
    // Roth's next date is only estimated: listed last, apart from the dated races.
    expect(page('europe/full-distance').races.at(-1)!.id).toBe('challenge-roth-full');
  });

  it('search a country by name, with its region when the name also matches races elsewhere', () => {
    const mexican = race('ironman-cozumel-full');
    const more = [1, 2, 3, 4].map((i): Race => ({ ...mexican, id: `mx-${i}`, name: `Race ${i}` }));
    const newMexico: Race = {
      ...race('ironman-kailua-kona-full'),
      id: 'us-new-mexico',
      name: 'IRONMAN 70.3 New Mexico',
      searchText: normalizeText('IRONMAN 70.3 New Mexico Ruidoso United States North America'),
    };
    const all = [...races, ...more, newMexico];
    const mexico = landingPages(all, TODAY).find((p) => p.path === 'mexico')!;
    expect(mexico.filters.q).toBe('Mexico Latin America');
    expect(appRaces(mexico, all).map((r) => r.id)).not.toContain('us-new-mexico');
    expect(page('netherlands').filters.q).toBe('Netherlands');
  });

  it('give the years of the announced dates', () => {
    expect(yearsText(page('europe/full-distance').races)).toBe('2027');
    expect(yearsText(page('full-distance').races)).toBe('2026–27');
  });

  it('link the pages around them, and are linked from their races', () => {
    expect(
      relatedPages(page('europe/full-distance'), pages).map((g) => [g.heading, g.links.map((l) => l.label)]),
    ).toEqual([
      ['Other distances in Europe', ['All distances']],
      ['Full distance elsewhere', ['Worldwide']],
    ]);
    expect(calendarsFor(race('ironman-frankfurt-full'), pages).map((p) => p.path)).toEqual([
      'europe/full-distance',
      'europe',
      'ironman',
      'full-distance',
    ]);
    const racePage = racePageHtml(race('ironman-frankfurt-full'), {
      siteUrl: '',
      today: TODAY,
      calendars: calendarsFor(race('ironman-frankfurt-full'), pages),
    });
    expect(racePage).toContain('<a href="../../races/europe/full-distance/">Full-distance triathlons in Europe</a>');
  });
});

describe('a race calendar page', () => {
  const doc = html('europe/full-distance');

  it('names the calendar and its years, with a canonical URL and breadcrumbs for search engines', () => {
    expect(doc).toContain('<title>Full-distance triathlons in Europe: 2027 race calendar · TriMap</title>');
    expect(doc).toContain('<link rel="canonical" href="https://x.github.io/tri-map/races/europe/full-distance/" />');
    const ld = JSON.parse(doc.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!) as {
      itemListElement: { name: string; item: string }[];
    };
    expect(ld.itemListElement.map((i) => i.name)).toEqual([
      'Race calendars',
      'Europe',
      'Full-distance triathlons in Europe',
    ]);
    expect(ld.itemListElement[1]!.item).toBe('https://x.github.io/tri-map/races/europe/');
  });

  it('lists the dated races by month, and says which have no date yet without estimating one', () => {
    const text = bodyText(doc);
    expect(text).toContain(
      '5 races with an announced date, from 19 Jun to 11 Sep 2027. 1 more has no date announced yet.',
    );
    expect(text).toContain('Full distance: 3.8 km swim, 180 km bike, 42.2 km run.');
    expect(text).toContain('June 2027 2');
    expect(text).toContain('IRONMAN Frankfurt Frankfurt am Main, Germany · IRONMAN · Full');
    expect(text).toContain('Celtman Extreme Scottish Triathlon');
    expect(text).toContain('Ballot');
    expect(text).toContain('Next date not announced yet Challenge Roth · Roth, Germany · last held Sun 5 Jul 2026');
    expect(text).not.toMatch(/≈|4 Jul 2027/);
  });

  it('links each race to its page and the whole list to the app, relative to its own folder', () => {
    expect(doc).toContain('href="../../../race/ironman-frankfurt-full/"');
    expect(doc).toContain(
      '<a class="btn primary" href="../../../?dist=full&amp;region=europe">Open these on the map</a>',
    );
    expect(doc).toContain('href="../../../races/europe/"');
    // The map: one linked marker per race.
    expect(doc.match(/<a href="[^"]*race\/[^"]+\/" transform=/g)).toHaveLength(
      page('europe/full-distance').races.length,
    );
  });

  it('escapes race names', () => {
    const renamed = races.map((r) => (r.id === 'ironman-frankfurt-full' ? { ...r, name: 'IRONMAN <b>x</b>' } : r));
    const list = landingPages(renamed, TODAY);
    const out = html('europe/full-distance', list);
    expect(out).not.toContain('<b>x</b>');
    expect(out).toContain('IRONMAN &lt;b&gt;x&lt;/b&gt;');
  });
});

describe('the race calendars index and the sitemap', () => {
  it('list every calendar page', () => {
    const hub = landingHubHtml(pages, { siteUrl: SITE });
    for (const p of pages) expect(hub).toContain(`href="../races/${p.path}/"`);
    expect(bodyText(hub)).toContain('Europe · Full distance 6');
    expect(hub).toContain('<link rel="canonical" href="https://x.github.io/tri-map/races/" />');
    // The footer, shared with the calendar pages.
    for (const doc of [hub, html('europe')]) {
      expect(doc).toContain('<a href="https://buymeacoffee.com/mastap" rel="noopener">Buy me a coffee</a>');
    }
  });

  it('puts the calendars in the sitemap, dated by their latest checked race', () => {
    const xml = sitemapXml(SITE, races, pages);
    expect(xml).toContain('<url><loc>https://x.github.io/tri-map/races/</loc><lastmod>');
    const latest = page('europe/full-distance')
      .races.map((r) => r.verifiedAt)
      .sort()
      .at(-1);
    expect(xml).toContain(
      `<url><loc>https://x.github.io/tri-map/races/europe/full-distance/</loc><lastmod>${latest}</lastmod></url>`,
    );
  });
});
