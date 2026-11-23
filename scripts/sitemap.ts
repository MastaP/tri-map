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

/**
 * The home page and the page of every race the app lists (one with a next edition, even an
 * estimated one). Races with no future edition keep their page for old links, marked
 * noindex, and are left out. `lastmod` is when the race's dates were last checked.
 */
export function sitemapXml(siteUrl: string, races: readonly Race[]): string {
  const listed = races.filter((r) => r.nextEdition).sort((a, b) => a.id.localeCompare(b.id));
  const urls = [
    `  <url><loc>${escXml(siteUrl)}</loc></url>`,
    ...listed.map(
      (r) => `  <url><loc>${escXml(`${siteUrl}race/${r.id}/`)}</loc><lastmod>${r.verifiedAt}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
