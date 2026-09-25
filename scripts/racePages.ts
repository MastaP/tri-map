/**
 * The small per-race page written at build time (race/<id>/index.html): its title and
 * Open Graph tags name the race, so a shared link unfurls as that race in chat apps; a
 * visitor is sent straight on to the app (../../?race=<id>).
 *
 * Like the app by default, it only states announced dates: a race whose next date is
 * not announced yet says so, with when it was last held. The pages are rebuilt on every
 * deploy and weekly (.github/workflows/deploy.yml), so "next date" does not go stale.
 */
import { DISTANCES } from '../src/data/brands.ts';
import { isNearStandard, legsText, raceLegs } from '../src/data/course.ts';
import type { Race } from '../src/data/types.ts';
import { formatDate, type ISODate } from '../src/lib/dates.ts';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The next announced date ("Sun 27 Jun 2027", "Sun 30 May 2027 (TBC)"), else null. */
export function raceWhenText(race: Race): string | null {
  const next = race.nextEdition;
  if (!next || next.estimated) return null;
  return `${formatDate(next.date)}${next.status === 'tentative' ? ' (TBC)' : ''}`;
}

/** The last edition held before `today`, if any (cancelled ones do not count). */
function lastHeld(race: Race, today: ISODate): ISODate | null {
  return race.editions.findLast((e) => e.status !== 'cancelled' && (e.endDate ?? e.date) < today)?.date ?? null;
}

/**
 * `successorName`: name of the race this one continues as (`continuedAs`), if any.
 * `today`: the build day, for "last held".
 */
export function racePageHtml(race: Race, siteUrl: string, successorName: string | undefined, today: ISODate): string {
  const d = DISTANCES[race.distance];
  const when = raceWhenText(race);
  const held = lastHeld(race, today);
  const notAnnounced = held
    ? `Next date not announced yet · last held ${formatDate(held)}`
    : 'Next date not announced yet';
  const title = [race.name, when?.replace(/ \(.*\)$/, ''), 'TriMap'].filter(Boolean).join(' · ');
  // With no edition to enter, the entry rule is moot: name the successor, if any, instead.
  const entry = !race.nextEdition
    ? successorName
      ? `Continues as ${successorName}.`
      : ''
    : race.entry === 'qualification'
      ? 'Qualifier only.'
      : race.entry === 'ballot'
        ? 'Entry by ballot.'
        : 'Open entry.';
  const legs = legsText(raceLegs(race));
  const description = [
    when ?? (race.nextEdition ? notAnnounced : 'No future edition announced'),
    `${race.city}, ${race.countryName}`,
    isNearStandard(race) ? `Non-standard ${d.long.toLowerCase()} (${legs})` : `${d.long} (${legs})`,
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
