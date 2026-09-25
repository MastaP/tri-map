/**
 * The small per-race page written at build time (race/<id>/index.html): its title and
 * Open Graph tags name the race, so a shared link unfurls as that race in chat apps; a
 * visitor is sent straight on to the app (../../?race=<id>).
 */
import { DISTANCES } from '../src/data/brands.ts';
import type { Race } from '../src/data/types.ts';
import { formatDate, formatMonthShort } from '../src/lib/dates.ts';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function raceWhenText(race: Race): string | null {
  const next = race.nextEdition;
  if (!next) return null;
  if (next.estimated) return `≈ ${formatMonthShort(next.date)} (date TBA)`;
  return `${formatDate(next.date)}${next.status === 'tentative' ? ' (TBC)' : ''}`;
}

/** `successorName`: name of the race this one continues as (`continuedAs`), if any. */
export function racePageHtml(race: Race, siteUrl: string, successorName?: string): string {
  const d = DISTANCES[race.distance];
  const when = raceWhenText(race);
  const title = [race.name, when?.replace(/ \(.*\)$/, ''), 'TriMap'].filter(Boolean).join(' · ');
  // With no edition to enter, the entry rule is moot: name the successor, if any, instead.
  const entry = !when
    ? successorName
      ? `Continues as ${successorName}.`
      : ''
    : race.entry === 'qualification'
      ? 'Qualifier only.'
      : race.entry === 'ballot'
        ? 'Entry by ballot.'
        : 'Open entry.';
  const description = [
    when ?? 'No future edition announced',
    `${race.city}, ${race.countryName}`,
    `${d.long} (${d.swim} / ${d.bike} / ${d.run} km)`,
  ].join(' · ');
  const summary = entry ? `${description}. ${entry}` : `${description}.`;
  const app = `../../?race=${encodeURIComponent(race.id)}`;
  const abs = siteUrl ? `${siteUrl}race/${race.id}/` : '';
  const image = siteUrl ? `${siteUrl}og-image.png` : '../../og-image.png';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(summary)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="TriMap" />
    <meta property="og:title" content="${esc(`${race.name} · ${d.long}`)}" />
    <meta property="og:description" content="${esc(summary)}" />
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
    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <meta http-equiv="refresh" content="0; url=${esc(app)}" />
    <script>location.replace(${JSON.stringify(app)} + location.hash);</script>
  </head>
  <body>
    <p><a href="${esc(app)}">${esc(race.name)} on TriMap</a></p>
  </body>
</html>
`;
}
