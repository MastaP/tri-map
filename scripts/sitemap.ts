/**
 * robots.txt and sitemap.xml, written at build time next to the race pages, so search
 * engines find every race page (the app itself is one page whose races live in the query
 * string).
 */
import type { Race } from '../src/data/types.ts';

const escXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Allows everything; names the sitemap when the site URL is known. */
export function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}sitemap.xml\n` : ''}`;
}

/** A race calendar page (races/<path>/) and the races it lists. */
export interface CalendarEntry {
  path: string;
  races: readonly Pick<Race, 'verifiedAt'>[];
}

/**
 * The home page, the race calendar pages (races/ and races/<path>/) and the page of every
 * race the app lists (one with a next edition, even an estimated one). Races with no
 * future edition keep their page for old links, marked noindex, and are left out.
 * `lastmod` is when the race's dates were last checked (for a calendar, its latest race's).
 */
export function sitemapXml(siteUrl: string, races: readonly Race[], calendars: readonly CalendarEntry[] = []): string {
  const listed = races.filter((r) => r.nextEdition).sort((a, b) => a.id.localeCompare(b.id));
  const latest = (rs: readonly Pick<Race, 'verifiedAt'>[]) =>
    rs
      .map((r) => r.verifiedAt)
      .sort()
      .at(-1);
  const calendarUrl = (path: string, lastmod: string | undefined) =>
    `  <url><loc>${escXml(`${siteUrl}races/${path ? `${path}/` : ''}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  const urls = [
    `  <url><loc>${escXml(siteUrl)}</loc></url>`,
    ...(calendars.length
      ? [
          calendarUrl('', latest(calendars.flatMap((c) => c.races))),
          ...calendars.map((c) => calendarUrl(c.path, latest(c.races))),
        ]
      : []),
    ...listed.map(
      (r) => `  <url><loc>${escXml(`${siteUrl}race/${r.id}/`)}</loc><lastmod>${r.verifiedAt}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
