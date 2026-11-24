/**
 * Race calendar pages, written at build time under races/: one per distance, series,
 * course type, region and country, and per region or country and distance ("Half-distance
 * triathlons in Germany"), when enough races match. They answer what people search for,
 * list the matching races by month with what an age-grouper decides on, and link to the
 * race pages and to each other. races/index.html lists them all.
 *
 * Each page is defined by the app's own filters, so "Open these on the map" opens the same
 * races (country pages search the country's name, and list only races in that country).
 * Like the app, a page states only announced dates; races whose next date is not
 * announced yet are listed apart, with when they were last held.
 */
import { BRANDS, brandGlyphSvg, DISTANCES, glyphPixelSize, type BrandId, type DistanceId } from '../src/data/brands.ts';
import { legsLong, raceLegs } from '../src/data/course.ts';
import { HIDDEN_BY_SOLD_OUT } from '../src/data/registration.ts';
import { REGIONS, type RegionId } from '../src/data/regions.ts';
import type { Race } from '../src/data/types.ts';
import { formatDate, formatDayMonth, type ISODate } from '../src/lib/dates.ts';
import { DEFAULT_FILTERS, filterRaces, type Filters } from '../src/lib/filters.ts';
import { ENTRY_BADGE, REGISTRATION_BADGE, seriesLabel, TERRAIN_LABEL } from '../src/lib/raceText.ts';
import { serializeUrlState } from '../src/lib/urlState.ts';
import { fontFaceCss, lastHeld, PAGE_THEME_CSS } from './racePages.ts';
import { fitView, outlinePaths, projectPoint, type WorldOutlines } from './regionMap.ts';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** How each distance is named in page URLs, titles and breadcrumbs. */
export const DISTANCE_PAGES: Record<DistanceId, { slug: string; plural: string; crumb: string }> = {
  full: { slug: 'full-distance', plural: 'Full-distance triathlons', crumb: 'Full distance' },
  half: { slug: 'half-distance', plural: 'Half-distance triathlons', crumb: 'Half distance' },
  t100: { slug: 't100', plural: 'T100 races', crumb: 'T100' },
  olympic: { slug: 'olympic-distance', plural: 'Olympic-distance triathlons', crumb: 'Olympic distance' },
  sprint: { slug: 'sprint', plural: 'Sprint triathlons', crumb: 'Sprint' },
  cross: { slug: 'off-road', plural: 'Off-road triathlons', crumb: 'Off-road' },
  duathlon: { slug: 'duathlon', plural: 'Duathlons', crumb: 'Duathlon' },
  'time-trial': { slug: 'time-trial', plural: 'Bike time trials', crumb: 'Time trial' },
};

/** Distances in the order pages and links list them. */
const DISTANCE_ORDER: DistanceId[] = ['full', 'half', 't100', 'olympic', 'sprint', 'cross', 'duathlon', 'time-trial'];

/** Countries named with "the" in a sentence. */
const WITH_THE = new Set(['US', 'GB', 'NL', 'PH', 'AE', 'CZ', 'DO', 'BS', 'MV']);

/** The fewest races (with a next edition) a page needs, per kind. */
export const MIN_RACES: Record<LandingKind, number> = {
  distance: 3,
  series: 5,
  course: 5,
  region: 5,
  'region-distance': 5,
  country: 5,
  'country-distance': 4,
};

export type LandingKind =
  'distance' | 'series' | 'course' | 'region' | 'region-distance' | 'country' | 'country-distance';

export interface LandingPage {
  /** Under races/, without slashes at the ends: "germany/half-distance". */
  path: string;
  kind: LandingKind;
  /** Key for related links: "cd:DE:half", "g:europe", "d:full", "s:ironman", "k:flat-full-distance". */
  key: string;
  title: string;
  /** Short name in breadcrumbs and link lists ("Half distance", "Germany"). */
  label: string;
  /** Breadcrumb trail up to (not including) this page, as page keys. */
  parents: string[];
  /** The app's filters for "Open these on the map". */
  filters: Partial<Filters>;
  distance?: DistanceId;
  region?: RegionId;
  /** ISO country code of a country page. */
  country?: string;
  /** Races with a next edition, announced dates first by date, then the rest by name. */
  races: Race[];
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const placeName = (race: Pick<Race, 'country' | 'countryName'>) =>
  WITH_THE.has(race.country) ? `the ${race.countryName}` : race.countryName;

/** "Triathlons in X", or "Triathlons and duathlons in X" when there are duathlons too. */
function sportsTitle(races: readonly Race[], where: string): string {
  const sports = new Set(races.map((r) => DISTANCES[r.distance].sport));
  const words = [
    sports.has('triathlon') ? 'triathlons' : null,
    sports.has('duathlon') ? 'duathlons' : null,
    sports.has('time-trial') ? 'time trials' : null,
  ].filter((w): w is string => w !== null);
  const text = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? 'races');
  return `${text[0]!.toUpperCase()}${text.slice(1)} in ${where}`;
}

const byDate = (a: Race, b: Race) => {
  const ea = a.nextEdition!.estimated;
  const eb = b.nextEdition!.estimated;
  if (ea !== eb) return ea ? 1 : -1;
  return ea ? a.name.localeCompare(b.name) : a.nextEdition!.date.localeCompare(b.nextEdition!.date);
};

/**
 * Every calendar page with enough races, from all races (those with no next edition are
 * left out). The order is the hub page's: distances, series, courses, regions, regions by
 * distance, countries, countries by distance.
 */
export function landingPages(all: readonly Race[], today: ISODate): LandingPage[] {
  const ctx = { today, bounds: null, shortlist: new Set<string>() };
  /** The races a page lists: the app's filters with estimated dates, and its country if any. */
  const select = (filters: Partial<Filters>, country?: string) =>
    filterRaces(all, { ...DEFAULT_FILTERS, ...filters, ...(country ? { q: '' } : {}), showEstimated: true }, ctx)
      .filter((r) => !country || r.country === country)
      .sort(byDate);
  const pages: LandingPage[] = [];
  const add = (page: Omit<LandingPage, 'races'>) => {
    const races = select(page.filters, page.country);
    if (races.length >= MIN_RACES[page.kind]) pages.push({ ...page, races });
  };

  for (const d of DISTANCE_ORDER) {
    const dp = DISTANCE_PAGES[d];
    add({
      path: dp.slug,
      kind: 'distance',
      key: `d:${d}`,
      title: dp.plural,
      label: dp.crumb,
      parents: [],
      filters: { distances: [d] },
      distance: d,
    });
  }
  const series: [string, string, string, Partial<Filters>, DistanceId?][] = [
    ['ironman', 'IRONMAN races', 'IRONMAN', { brands: ['ironman'], distances: ['full'] }, 'full'],
    ['ironman-70-3', 'IRONMAN 70.3 races', 'IRONMAN 70.3', { brands: ['ironman'], distances: ['half'] }, 'half'],
    ['ironman-5150', 'IRONMAN 5150 races', 'IRONMAN 5150', { brands: ['ironman'], distances: ['olympic'] }, 'olympic'],
    ['challenge-family', 'Challenge Family races', 'Challenge Family', { brands: ['challenge'] }],
    ['extreme-triathlons', 'Extreme triathlons', 'Extreme triathlons', { q: 'xtri' }],
  ];
  for (const [slug, title, label, filters, distance] of series) {
    add({ path: slug, kind: 'series', key: `s:${slug}`, title, label, parents: [], filters, distance });
  }
  const courses: [string, string, string, DistanceId, Filters['bike']][] = [
    ['flat-full-distance', 'Flat full-distance triathlons', 'Flat bike course', 'full', ['flat']],
    ['flat-half-distance', 'Flat half-distance triathlons', 'Flat bike course', 'half', ['flat']],
    ['hilly-full-distance', 'Hilly full-distance triathlons', 'Hilly bike course', 'full', ['hilly', 'mountainous']],
  ];
  for (const [slug, title, label, d, bike] of courses) {
    add({
      path: slug,
      kind: 'course',
      key: `k:${slug}`,
      title,
      label,
      parents: [`d:${d}`],
      filters: { distances: [d], bike },
      distance: d,
    });
  }
  const regions = Object.keys(REGIONS) as RegionId[];
  for (const g of regions) {
    const races = select({ regions: [g] });
    add({
      path: g,
      kind: 'region',
      key: `g:${g}`,
      title: sportsTitle(races, REGIONS[g].label),
      label: REGIONS[g].label,
      parents: [],
      filters: { regions: [g] },
      region: g,
    });
  }
  for (const g of regions) {
    for (const d of DISTANCE_ORDER) {
      const dp = DISTANCE_PAGES[d];
      add({
        path: `${g}/${dp.slug}`,
        kind: 'region-distance',
        key: `gd:${g}:${d}`,
        title: `${dp.plural} in ${REGIONS[g].label}`,
        label: dp.crumb,
        parents: [`g:${g}`],
        filters: { regions: [g], distances: [d] },
        region: g,
        distance: d,
      });
    }
  }
  // Countries, most races first.
  const countries = new Map<string, Race>();
  for (const r of all) if (r.nextEdition && !countries.has(r.country)) countries.set(r.country, r);
  const countryCount = (cc: string) => all.filter((r) => r.nextEdition && r.country === cc).length;
  const byCount = [...countries.values()].sort(
    (a, b) => countryCount(b.country) - countryCount(a.country) || a.countryName.localeCompare(b.countryName),
  );
  /**
   * What "Open these on the map" searches for a country: its name, plus its region when
   * the name alone also finds races elsewhere ("Mexico" finds IRONMAN 70.3 Ruidoso New
   * Mexico; "Mexico Latin America" does not).
   */
  const countryQuery = (r: Race) => {
    const elsewhere = (q: string) => select({ q }).some((x) => x.country !== r.country);
    return elsewhere(r.countryName) ? `${r.countryName} ${REGIONS[r.region].label}` : r.countryName;
  };
  const queries = new Map(byCount.map((r) => [r.country, countryQuery(r)]));
  for (const r of byCount) {
    const races = select({ q: queries.get(r.country) }, r.country);
    add({
      path: slugify(r.countryName),
      kind: 'country',
      key: `c:${r.country}`,
      title: sportsTitle(races, placeName(r)),
      label: r.countryName,
      parents: [`g:${r.region}`],
      filters: { q: queries.get(r.country) },
      region: r.region,
      country: r.country,
    });
  }
  for (const r of byCount) {
    for (const d of DISTANCE_ORDER) {
      const dp = DISTANCE_PAGES[d];
      add({
        path: `${slugify(r.countryName)}/${dp.slug}`,
        kind: 'country-distance',
        key: `cd:${r.country}:${d}`,
        title: `${dp.plural} in ${placeName(r)}`,
        label: dp.crumb,
        parents: [`g:${r.region}`, `c:${r.country}`],
        filters: { q: queries.get(r.country), distances: [d] },
        region: r.region,
        country: r.country,
        distance: d,
      });
    }
  }
  const paths = new Set<string>();
  for (const p of pages) {
    if (paths.has(p.path)) throw new Error(`Two calendar pages at races/${p.path}/`);
    paths.add(p.path);
  }
  return pages;
}

/** The calendar pages a race is listed on, most specific first (for its race page). */
export function calendarsFor(race: Race, pages: readonly LandingPage[]): LandingPage[] {
  const order: LandingKind[] = [
    'country-distance',
    'country',
    'region-distance',
    'region',
    'course',
    'series',
    'distance',
  ];
  return pages
    .filter((p) => p.races.some((r) => r.id === race.id))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

interface LinkGroup {
  heading: string;
  links: { page: LandingPage; label: string }[];
}

/** Links to the pages around this one: other distances here, the same distance elsewhere. */
export function relatedPages(page: LandingPage, pages: readonly LandingPage[]): LinkGroup[] {
  const others = pages.filter((p) => p !== page);
  const regionName = (p: LandingPage) => REGIONS[p.region!].label;
  const countryName = (p: LandingPage) => p.races[0]!.countryName;
  const title = (p: LandingPage) => p.title;
  const label = (p: LandingPage) => p.label;
  /** The pages that pass `pred`, labelled for this group; `whole` labels the page for all distances. */
  const pick = (pred: (p: LandingPage) => boolean, name: (p: LandingPage) => string, whole?: string) =>
    others
      .filter(pred)
      .map((p) => ({ page: p, label: whole && !p.distance ? whole : name(p) }))
      .sort((a, b) => Number(!!a.page.distance) - Number(!!b.page.distance));
  const { kind, distance: d, region: g, country: cc } = page;
  const dp = d ? DISTANCE_PAGES[d] : null;
  const groups: LinkGroup[] = [];
  switch (kind) {
    case 'distance':
      groups.push({
        heading: `${dp!.crumb} by region`,
        links: pick((p) => p.kind === 'region-distance' && p.distance === d, regionName),
      });
      groups.push({
        heading: `${dp!.crumb} by country`,
        links: pick((p) => p.kind === 'country-distance' && p.distance === d, countryName),
      });
      groups.push({
        heading: 'Series and courses',
        links: pick((p) => (p.kind === 'series' || p.kind === 'course') && p.distance === d, title),
      });
      break;
    case 'series':
    case 'course':
      groups.push({
        heading: 'More race calendars',
        links: pick((p) => (p.kind === 'distance' && p.distance === d) || p.kind === kind, title),
      });
      break;
    case 'region':
      groups.push({
        heading: `By distance in ${regionName(page)}`,
        links: pick((p) => p.kind === 'region-distance' && p.region === g, label),
      });
      groups.push({
        heading: `Countries in ${regionName(page)}`,
        links: pick((p) => p.kind === 'country' && p.region === g, label),
      });
      groups.push({ heading: 'Other regions', links: pick((p) => p.kind === 'region', label) });
      break;
    case 'region-distance':
      groups.push({
        heading: `Other distances in ${regionName(page)}`,
        links: pick(
          (p) => (p.kind === 'region' || p.kind === 'region-distance') && p.region === g,
          label,
          'All distances',
        ),
      });
      groups.push({
        heading: `${dp!.crumb} by country`,
        links: pick((p) => p.kind === 'country-distance' && p.region === g && p.distance === d, countryName),
      });
      groups.push({
        heading: `${dp!.crumb} elsewhere`,
        links: pick(
          (p) => (p.kind === 'distance' || p.kind === 'region-distance') && p.distance === d,
          (p) => (p.region ? regionName(p) : 'Worldwide'),
        ),
      });
      break;
    case 'country':
      groups.push({
        heading: `By distance in ${page.label}`,
        links: pick((p) => p.kind === 'country-distance' && p.country === cc, label),
      });
      groups.push({
        heading: `Elsewhere in ${regionName(page)}`,
        links: pick((p) => (p.kind === 'region' || p.kind === 'country') && p.region === g, label),
      });
      break;
    case 'country-distance':
      groups.push({
        heading: `Other distances in ${countryName(page)}`,
        links: pick(
          (p) => (p.kind === 'country' || p.kind === 'country-distance') && p.country === cc,
          label,
          'All distances',
        ),
      });
      groups.push({
        heading: `${dp!.crumb} elsewhere in ${regionName(page)}`,
        links: pick(
          (p) => (p.kind === 'region-distance' || p.kind === 'country-distance') && p.region === g && p.distance === d,
          (p) => (p.country ? countryName(p) : `All of ${regionName(p)}`),
        ),
      });
      groups.push({
        heading: `${dp!.crumb} worldwide`,
        links: pick(
          (p) => p.kind === 'distance' && p.distance === d,
          () => 'Worldwide',
        ),
      });
      break;
  }
  return groups.filter((grp) => grp.links.length);
}

export interface LandingPageOptions {
  /** Absolute URL of the site, ending in "/"; empty when unknown. */
  siteUrl: string;
  today: ISODate;
  world: WorldOutlines;
  /** Bundled font files (paths from the site root). */
  fonts?: { sans?: string; display?: string };
}

/** The way back to the site root from races/<path>/. */
const rootOf = (path: string) => '../'.repeat(path ? path.split('/').length + 1 : 1);

/** "2027", or "2026–27" when the announced dates span two years. */
export function yearsText(races: readonly Race[]): string {
  const years = races.filter((r) => !r.nextEdition!.estimated).map((r) => Number(r.nextEdition!.date.slice(0, 4)));
  if (!years.length) return '';
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? String(lo) : `${lo}–${String(hi).slice(2)}`;
}

/** The sentence under the title: how many races, when, and the distance's legs. */
function ledeText(page: LandingPage, announced: readonly Race[], tba: readonly Race[]): string {
  const parts: string[] = [];
  if (announced.length) {
    const first = announced[0]!.nextEdition!.date;
    const last = announced.at(-1)!.nextEdition!.date;
    const range =
      first.slice(0, 4) === last.slice(0, 4)
        ? `${formatDayMonth(first)} to ${formatDayMonth(last)} ${last.slice(0, 4)}`
        : `${formatDayMonth(first, { year: true })} to ${formatDayMonth(last, { year: true })}`;
    parts.push(
      `${announced.length} ${announced.length === 1 ? 'race' : 'races'} with an announced date, ${first === last ? `on ${formatDate(first)}` : `from ${range}`}.`,
    );
  }
  if (tba.length) parts.push(`${tba.length} more ${tba.length === 1 ? 'has' : 'have'} no date announced yet.`);
  const d = page.distance;
  if (d && DISTANCES[d].standard) parts.push(`${DISTANCES[d].long}: ${legsLong(raceLegs({ distance: d }))}.`);
  if (page.kind === 'series' && page.key === 's:extreme-triathlons') {
    parts.push('Point-to-point and mountain races of the Xtri World Tour, mostly over the full distance.');
  }
  return parts.join(' ');
}

/** Brand glyphs as <symbol>s, so the map and the list draw each one once. */
function glyphSymbols(races: readonly Race[]): string {
  const out: string[] = [];
  const seen = new Set<string>();
  const symbol = (id: string, svg: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(
      svg
        .replace(
          /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="([^"]+)"[^>]*>/,
          `<symbol id="${id}" viewBox="$1">`,
        )
        .replace(/<\/svg>$/, '</symbol>'),
    );
  };
  for (const r of races) {
    const hollow = r.nextEdition!.estimated;
    const halo = r.distance === 'full';
    symbol(markerId(r.brand, halo, hollow), brandGlyphSvg(r.brand, { ring: 'var(--surface)', halo, hollow }));
    symbol(markerId(r.brand, false, false), brandGlyphSvg(r.brand, { ring: 'var(--surface)' }));
  }
  return out.join('');
}

const markerId = (brand: BrandId, halo: boolean, hollow: boolean) =>
  `g-${brand}${halo ? '-full' : ''}${hollow ? '-tba' : ''}`;

/** The map of a page's races: each one its brand glyph, linking to its race page. */
function mapSvg(races: readonly Race[], world: WorldOutlines, root: string): string {
  const width = 800;
  const height = 380;
  const { lng0, lat0, view } = fitView(races, width, height, 34, 9000);
  const { land, borders } = outlinePaths(world, lng0, lat0, view, { thin: 1.2, digits: 0 });
  const core = 22;
  // Dated races on top of estimated ones, and full distance (the ringed glyph) on top.
  const ordered = [...races].sort(
    (a, b) =>
      Number(!a.nextEdition!.estimated) - Number(!b.nextEdition!.estimated) ||
      Number(a.distance === 'full') - Number(b.distance === 'full') ||
      b.lat - a.lat,
  );
  const markers = ordered
    .map((r) => {
      const [x, y] = projectPoint(r.lng, r.lat, lng0, lat0, view);
      const halo = r.distance === 'full';
      const size = glyphPixelSize(core, halo);
      // Centred on its own origin, so the phone layout can enlarge it in place (.mk scale).
      return `<a href="${root}race/${esc(r.id)}/" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${esc(r.name)}</title><use class="mk" href="#${markerId(r.brand, halo, r.nextEdition!.estimated)}" x="${(-size / 2).toFixed(1)}" y="${(-size / 2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}"/></a>`;
    })
    .join('');
  return `<svg class="map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Map of the ${races.length} races">
          <defs>${glyphSymbols(races)}</defs>
          <path class="land" d="${land}"/><path class="border" d="${borders}"/>
          ${markers}
        </svg>`;
}

function raceRow(r: Race, root: string): string {
  const reg = r.registration;
  const badges = [
    r.entry !== 'open' ? ENTRY_BADGE[r.entry] : null,
    reg && reg.status !== 'open' ? REGISTRATION_BADGE[reg.status] : null,
  ].filter((b): b is string => b !== null);
  const course = [
    r.bike ? `${TERRAIN_LABEL[r.bike]} bike` : null,
    r.run ? `${TERRAIN_LABEL[r.run].toLowerCase()} run` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const d = DISTANCES[r.distance];
  const date = r.nextEdition!.date;
  const [weekday, day] = formatDate(date).split(' ');
  const tentative = r.nextEdition!.status === 'tentative';
  return `<li class="race">
            <div class="when"><span class="dow">${esc(weekday!)}</span><span class="day">${esc(day!)}</span>${tentative ? '<span class="tbc">TBC</span>' : ''}</div>
            <div class="what">
              <a class="name" href="${root}race/${esc(r.id)}/">${esc(r.name)}</a>
              <div class="meta">${esc(`${r.city}, ${r.countryName}`)} · ${esc(seriesLabel(r, BRANDS[r.brand].label))} · ${esc(d.badge)}</div>
              <div class="tags">${course ? `<span class="tag">${esc(course)}</span>` : ''}${badges.map((b) => `<span class="tag warn">${esc(b)}</span>`).join('')}</div>
            </div>
            <svg class="glyph" viewBox="0 0 1 1" aria-hidden="true"><use href="#${markerId(r.brand, false, false)}" width="1" height="1"/></svg>
          </li>`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Shared <head> bits and CSS of the calendar pages. */
function pageShell(opts: {
  title: string;
  description: string;
  path: string;
  siteUrl: string;
  fonts: { sans?: string; display?: string };
  jsonLd?: object;
  body: string;
}): string {
  const root = rootOf(opts.path);
  const abs = opts.siteUrl ? `${opts.siteUrl}races/${opts.path ? `${opts.path}/` : ''}` : '';
  const image = opts.siteUrl ? `${opts.siteUrl}og-image.png` : `${root}og-image.png`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(opts.title)}</title>
    <meta name="description" content="${esc(opts.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="TriMap" />
    <meta property="og:title" content="${esc(opts.title)}" />
    <meta property="og:description" content="${esc(opts.description)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />${
      abs
        ? `
    <meta property="og:url" content="${esc(abs)}" />
    <link rel="canonical" href="${esc(abs)}" />`
        : ''
    }
    <link rel="icon" type="image/svg+xml" href="${root}favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="${root}favicon-32.png" />
    <link rel="apple-touch-icon" href="${root}apple-touch-icon.png" />${
      opts.jsonLd
        ? `
    <script type="application/ld+json">${scriptJson(opts.jsonLd)}</script>`
        : ''
    }
    <style>
      ${fontFaceCss(opts.fonts, root)}
      ${PAGE_THEME_CSS}
      :root { --land: #e4e8ee; --sea: #f7f9fb; --border: #c6cdd8; --tag: #eef1f5; }
      @media (prefers-color-scheme: dark) {
        :root { --land: #1a2337; --sea: #0b1019; --border: #2c3850; --tag: #18202d; }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font: 15px/1.55 'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      }
      a { color: inherit; text-underline-offset: 2px; }
      .wrap { max-width: 52rem; margin: 0 auto; padding: 16px; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 4px 16px; }
      .home { font: 700 22px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.01em; text-decoration: none; }
      .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
      .crumbs { margin: 0 0 6px; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; font-size: 13px; color: var(--muted); }
      .crumbs li + li::before { content: '›'; margin-right: 4px; }
      h1 { margin: 0 0 6px; font: 700 40px/1.02 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; }
      h2 { margin: 0 0 10px; font: 700 20px/1.2 'Barlow Condensed', 'Arial Narrow', sans-serif; }
      .lede { margin: 0; color: var(--muted); max-width: 42rem; }
      .stats { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 14px; }
      .stats b { font: 700 20px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; margin-right: 4px; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; }
      .btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 12px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); }
      .btn.primary { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
      .mapcard { padding: 0; overflow: hidden; }
      .map { display: block; width: 100%; height: auto; background: var(--sea); }
      .land { fill: var(--land); stroke: var(--border); stroke-width: 0.8; stroke-linejoin: round; fill-rule: evenodd; }
      .border { fill: none; stroke: var(--border); stroke-width: 0.7; stroke-dasharray: 3 2; }
      .month h2 { margin: 8px 0 8px; font-size: 22px; display: flex; align-items: center; gap: 8px; }
      .count { font: 600 12px/1 'Inter Variable', 'Inter', sans-serif; color: var(--muted); background: var(--tag); border-radius: 999px; padding: 4px 8px; }
      .races { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 8px; }
      .race { display: grid; grid-template-columns: 52px 1fr 32px; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
      .when { text-align: center; line-height: 1; }
      .dow { display: block; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
      .day { display: block; font: 700 28px/1.05 'Barlow Condensed', 'Arial Narrow', sans-serif; }
      .tbc { display: block; font-size: 11px; font-weight: 600; color: var(--muted); }
      .name { font-size: 16px; font-weight: 650; text-decoration: none; }
      .name:hover { text-decoration: underline; }
      .meta { color: var(--muted); font-size: 13px; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .tags:empty { display: none; }
      .tag { font-size: 12px; font-weight: 600; background: var(--tag); border-radius: 999px; padding: 2px 9px; }
      .tag.warn { background: var(--badge-bg); color: var(--badge-fg); }
      .glyph { width: 30px; height: 30px; }
      ul.plain { margin: 0; padding-left: 18px; }
      ul.plain li + li { margin-top: 4px; }
      .faint { color: var(--muted); }
      .links { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; padding: 0; list-style: none; }
      .links:last-child { margin-bottom: 0; }
      .links a { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; font-size: 14px; text-decoration: none; }
      .links a:hover { border-color: var(--muted); }
      .links span { color: var(--muted); }
      footer { color: var(--muted); font-size: 12px; padding: 4px 4px 24px; }
      @media (max-width: 560px) {
        h1 { font-size: 32px; }
        .race { grid-template-columns: 44px 1fr; }
        .glyph { display: none; }
        .mk { transform: scale(1.7); }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <a class="home" href="${root}">TriMap</a>
        <a href="${root}">All races on the map</a>
      </header>
      <main>
${opts.body}
      </main>
      <footer>
        Dates can change; always confirm on the official website. Updated daily. TriMap is not affiliated with
        IRONMAN, Challenge Family, PTO/T100, World Triathlon or XTERRA.
      </footer>
    </div>
  </body>
</html>
`;
}

const linkList = (links: LinkGroup['links'], root: string) =>
  `<ul class="links">${links.map(({ page: p, label }) => `<li><a href="${root}races/${esc(p.path)}/">${esc(label)} <span>${p.races.length}</span></a></li>`).join('')}</ul>`;

export function landingPageHtml(page: LandingPage, pages: readonly LandingPage[], opts: LandingPageOptions): string {
  const root = rootOf(page.path);
  const byKey = new Map(pages.map((p) => [p.key, p]));
  const announced = page.races.filter((r) => !r.nextEdition!.estimated);
  const tba = page.races.filter((r) => r.nextEdition!.estimated);
  const years = yearsText(page.races);
  const fullTitle = `${page.title}${years ? `: ${years} race calendar` : ''} · TriMap`;
  const crumbs = [
    { label: 'Race calendars', path: '' },
    ...page.parents.flatMap((k) => (byKey.has(k) ? [{ label: byKey.get(k)!.label, path: byKey.get(k)!.path }] : [])),
  ];
  const names = announced.slice(0, 3).map((r) => r.name);
  const more = announced.length - names.length;
  const months = (iso: ISODate) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]!.slice(0, 3)} ${iso.slice(0, 4)}`;
  const description = announced.length
    ? `${page.title} with an announced date, ${months(announced[0]!.nextEdition!.date)} to ${months(announced.at(-1)!.nextEdition!.date)}: ${names.join(', ')}${more ? ` and ${more} more` : ''}. Dates, venues, courses and which you can still enter.`
    : `${page.title}: venues, distances, courses and when they were last held.`;

  const soldOut = announced.filter((r) => r.registration && HIDDEN_BY_SOLD_OUT.has(r.registration.status)).length;
  const open = announced.filter(
    (r) => r.entry === 'open' && !(r.registration && HIDDEN_BY_SOLD_OUT.has(r.registration.status)),
  ).length;
  const stats = [
    [announced.length, 'with a date'],
    [open, 'open entry'],
    [soldOut, 'sold out'],
    [announced.filter((r) => r.entry === 'ballot').length, 'by ballot'],
    [announced.filter((r) => r.entry === 'qualification').length, 'qualifier only'],
    [tba.length, 'date not announced yet'],
  ].filter(([n], i) => i === 0 || (n as number) > 0);

  const byMonth = new Map<string, Race[]>();
  for (const r of announced) {
    const k = r.nextEdition!.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }
  const monthSections = [...byMonth]
    .map(
      ([k, rs]) => `        <section class="month" aria-labelledby="m-${k}">
          <h2 id="m-${k}">${MONTH_NAMES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)} <span class="count">${rs.length}</span></h2>
          <ul class="races">
          ${rs.map((r) => raceRow(r, root)).join('\n          ')}
          </ul>
        </section>`,
    )
    .join('\n');
  const tbaSection = tba.length
    ? `
        <section class="card" aria-labelledby="tba">
          <h2 id="tba">Next date not announced yet</h2>
          <ul class="plain">
          ${tba
            .map((r) => {
              const held = lastHeld(r, opts.today);
              return `<li><a href="${root}race/${esc(r.id)}/">${esc(r.name)}</a> <span class="faint">· ${esc(`${r.city}, ${r.countryName}`)}${held ? ` · last held ${esc(formatDate(held))}` : ''}</span></li>`;
            })
            .join('\n          ')}
          </ul>
        </section>`
    : '';
  const related = relatedPages(page, pages);
  const relatedSection = related.length
    ? `
        <section class="card" aria-labelledby="related">
          <h2 id="related" class="faint" style="font-size:15px;font-family:inherit;font-weight:600">More race calendars</h2>
          ${related.map((g) => `<h2>${esc(g.heading)}</h2>\n          ${linkList(g.links, root)}`).join('\n          ')}
        </section>`
    : '';
  const app = `${root}?${serializeUrlState({ filters: { ...DEFAULT_FILTERS, ...page.filters }, raceId: null, bounds: null })}`;
  const abs = (path: string) => `${opts.siteUrl}races/${path ? `${path}/` : ''}`;
  const jsonLd = opts.siteUrl
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [...crumbs, { label: page.title, path: page.path }].map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.label,
          item: abs(c.path),
        })),
      }
    : undefined;

  const body = `        <section class="card" aria-labelledby="title">
          <ol class="crumbs">${crumbs.map((c) => `<li><a href="${root}races/${c.path ? `${esc(c.path)}/` : ''}">${esc(c.label)}</a></li>`).join('')}</ol>
          <h1 id="title">${esc(page.title)}</h1>
          <p class="lede">${esc(ledeText(page, announced, tba))}</p>
          <ul class="stats">${stats.map(([n, label]) => `<li><b>${n}</b>${esc(label as string)}</li>`).join('')}</ul>
          <p class="actions"><a class="btn primary" href="${esc(app)}">Open these on the map</a></p>
        </section>
        <section class="card mapcard" aria-label="Map">
        ${mapSvg(page.races, opts.world, root)}
        </section>
${monthSections}${tbaSection}${relatedSection}`;
  return pageShell({
    title: fullTitle,
    description,
    path: page.path,
    siteUrl: opts.siteUrl,
    fonts: opts.fonts ?? {},
    jsonLd,
    body,
  });
}

/** races/index.html: every calendar page, by kind. */
export function landingHubHtml(
  pages: readonly LandingPage[],
  opts: Omit<LandingPageOptions, 'world' | 'today'>,
): string {
  const root = rootOf('');
  const group = (heading: string, kinds: LandingKind[], label: (p: LandingPage) => string = (p) => p.label) => {
    const links = pages.filter((p) => kinds.includes(p.kind));
    if (!links.length) return '';
    return `<h2>${esc(heading)}</h2>
          <ul class="links">${links.map((p) => `<li><a href="${root}races/${esc(p.path)}/">${esc(label(p))} <span>${p.races.length}</span></a></li>`).join('')}</ul>`;
  };
  const byKey = new Map(pages.map((p) => [p.key, p]));
  const parentLabel = (p: LandingPage) => byKey.get(p.parents.at(-1) ?? '')?.label ?? '';
  const total = new Set(pages.flatMap((p) => p.races.map((r) => r.id))).size;
  const body = `        <section class="card" aria-labelledby="title">
          <h1 id="title">Triathlon race calendars</h1>
          <p class="lede">${total} races by distance, series, course, region and country: the next announced dates, venues, courses and which you can still enter. Updated daily.</p>
          <p class="actions"><a class="btn primary" href="${root}">Open the map</a></p>
        </section>
        <section class="card">
          ${[
            group('By distance', ['distance'], (p) => p.title),
            group('By series', ['series'], (p) => p.title),
            group('By course', ['course'], (p) => p.title),
            group('By region', ['region'], (p) => p.label),
            group('By region and distance', ['region-distance'], (p) => `${parentLabel(p)} · ${p.label}`),
            group('By country', ['country'], (p) => p.label),
            group('By country and distance', ['country-distance'], (p) => `${parentLabel(p)} · ${p.label}`),
          ]
            .filter(Boolean)
            .join('\n          ')}
        </section>`;
  return pageShell({
    title: 'Triathlon race calendars: by distance, region and country · TriMap',
    description: `${total} triathlons and duathlons by distance, series, course, region and country, with their next announced dates and which you can still enter.`,
    path: '',
    siteUrl: opts.siteUrl,
    fonts: opts.fonts ?? {},
    body,
  });
}
