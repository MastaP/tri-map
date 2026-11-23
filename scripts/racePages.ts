/**
 * The page written at build time for each race (race/<id>/index.html). It is a real page,
 * readable without JavaScript and by search engines: what an age-grouper decides on (date,
 * venue, distance, course, entry, registration status), the known editions, races nearby,
 * schema.org event data for an announced date, and a link that opens the race in the app
 * (../../?race=<id>). Its title and Open Graph tags name the race, so a shared link
 * unfurls as that race in chat apps.
 *
 * Like the app by default, it only states announced dates: a race whose next date is not
 * announced yet says so, with when it was last held. The pages are rebuilt on every
 * deploy and daily (.github/workflows/deploy.yml), so "next date" and the registration
 * status do not go stale.
 */
import { BRANDS, brandGlyphSvg, DISTANCES, type BrandId } from '../src/data/brands.ts';
import { isNearStandard, legsLong, legsText, raceLegs } from '../src/data/course.ts';
import type { NextEdition } from '../src/data/nextEdition.ts';
import { REGISTRATION_METHOD_INFO } from '../src/data/registration.ts';
import type { Race } from '../src/data/types.ts';
import { formatDate, type ISODate } from '../src/lib/dates.ts';
import { haversineKm } from '../src/lib/geo.ts';
import {
  asOfText,
  ENTRY_BADGE,
  ENTRY_EXPLAINER,
  REGISTRATION_BADGE,
  REGISTRATION_EXPLAINER,
  REGISTRATION_WORDS,
  seriesLabel,
  SWIM_LONG,
  TERRAIN_LABEL,
} from '../src/lib/raceText.ts';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** JSON for a <script> element: "<" escaped, so no string in it can close the element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

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

/** A race near another one, with the distance between their venues. */
export interface NearbyRace {
  race: Race;
  km: number;
}

/**
 * The `count` races nearest to `race` that have a next edition (the ones the app lists),
 * nearest first; other distances at the same venue come first, at 0 km.
 */
export function nearbyRaces(race: Race, races: readonly Race[], count = 6): NearbyRace[] {
  return races
    .filter((r) => r.id !== race.id && r.nextEdition)
    .map((r) => ({ race: r, km: haversineKm(race.lat, race.lng, r.lat, r.lng) }))
    .sort((a, b) => a.km - b.km || a.race.name.localeCompare(b.race.name))
    .slice(0, count);
}

export interface RacePageOptions {
  /** Absolute URL of the site, ending in "/"; empty when unknown (no canonical, relative image). */
  siteUrl: string;
  /** The build day: what "next" and "last held" are relative to. */
  today: ISODate;
  /** The race this one continues as (`continuedAs`), if any. */
  successor?: Pick<Race, 'id' | 'name'>;
  /** Races to link as nearby, nearest first (see nearbyRaces). */
  nearby?: readonly NearbyRace[];
  /** Bundled font files (paths from the site root), so the page uses the app's typefaces. */
  fonts?: { sans?: string; display?: string };
}

/** Who runs the races of a brand, for the event data; independent races name their series, if any. */
const ORGANIZERS: Record<Exclude<BrandId, 'independent'>, string> = {
  ironman: 'IRONMAN',
  challenge: 'Challenge Family',
  t100: 'Professional Triathletes Organisation (T100)',
  'world-triathlon': 'World Triathlon',
  xterra: 'XTERRA',
};

/**
 * schema.org SportsEvent data for the next edition, only when its date is announced and
 * confirmed: an estimated or "TBC" date must not reach search results as a fact.
 */
export function raceEventData(race: Race, pageUrl: string, imageUrl: string, description: string): object | null {
  const next = race.nextEdition;
  if (!next || next.estimated || next.status !== 'confirmed') return null;
  const organizer = race.brand === 'independent' ? race.series : ORGANIZERS[race.brand];
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: race.name,
    sport: DISTANCES[race.distance].sport === 'triathlon' ? 'Triathlon' : DISTANCES[race.distance].long,
    startDate: next.date,
    endDate: next.endDate ?? next.date,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: `${race.city}, ${race.countryName}`,
      address: { '@type': 'PostalAddress', addressLocality: race.city, addressCountry: race.country },
      geo: { '@type': 'GeoCoordinates', latitude: race.lat, longitude: race.lng },
    },
    description,
    image: [imageUrl],
    ...(pageUrl ? { url: pageUrl } : {}),
    sameAs: race.url,
    ...(organizer ? { organizer: { '@type': 'Organization', name: organizer, url: new URL(race.url).origin } } : {}),
  };
}

/** "Sun 23 May 2027", with "(TBC)", "cancelled" or "held" as it applies on `today`. */
function editionText(e: Race['editions'][number], today: ISODate): string {
  const when =
    e.endDate && e.endDate !== e.date ? `${formatDate(e.date)} – ${formatDate(e.endDate)}` : formatDate(e.date);
  if (e.status === 'cancelled') return `${when} · cancelled`;
  if ((e.endDate ?? e.date) < today) return `${when} · held`;
  return e.status === 'tentative' ? `${when} (TBC)` : when;
}

function nearbyWhen(next: NextEdition | null): string {
  if (!next || next.estimated) return 'date not announced yet';
  return `${formatDate(next.date)}${next.status === 'tentative' ? ' (TBC)' : ''}`;
}

const kmText = (km: number) => (km < 1 ? 'same venue' : `${Math.round(km).toLocaleString('en-US')} km away`);

const fontFace = (family: string, file: string, weight: string) =>
  `@font-face { font-family: '${family}'; src: url('../../${file}') format('woff2'); font-weight: ${weight}; font-display: swap; }`;

export function racePageHtml(race: Race, opts: RacePageOptions): string {
  const { siteUrl, today, successor, nearby = [], fonts = {} } = opts;
  const d = DISTANCES[race.distance];
  const when = raceWhenText(race);
  const held = lastHeld(race, today);
  const notAnnounced = held
    ? `Next date not announced yet · last held ${formatDate(held)}`
    : 'Next date not announced yet';
  const title = [race.name, when?.replace(/ \(.*\)$/, ''), 'TriMap'].filter(Boolean).join(' · ');
  // With no edition to enter, the entry rule is moot: name the successor, if any, instead.
  const entry = !race.nextEdition
    ? successor
      ? `Continues as ${successor.name}.`
      : ''
    : race.entry === 'qualification'
      ? 'Qualifier only.'
      : race.entry === 'ballot'
        ? 'Entry by ballot.'
        : 'Open entry.';
  const legs = raceLegs(race);
  const nearStandard = isNearStandard(race);
  const dateLine = when ?? (race.nextEdition ? notAnnounced : 'No future edition announced');
  const description = [
    dateLine,
    `${race.city}, ${race.countryName}`,
    nearStandard ? `Non-standard ${d.long.toLowerCase()} (${legsText(legs)})` : `${d.long} (${legsText(legs)})`,
  ].join(' · ');
  const summary = entry ? `${description}. ${entry}` : `${description}.`;
  const app = `../../?race=${encodeURIComponent(race.id)}`;
  const abs = siteUrl ? `${siteUrl}race/${race.id}/` : '';
  const image = siteUrl ? `${siteUrl}og-image.png` : '../../og-image.png';
  const event = raceEventData(race, abs, image, summary);
  const reg = race.registration;
  const brand = BRANDS[race.brand];

  const badges = [
    race.entry !== 'open' ? ENTRY_BADGE[race.entry] : null,
    nearStandard ? 'Non-standard distance' : null,
    reg && reg.status !== 'open' ? REGISTRATION_BADGE[reg.status] : null,
  ].filter((b): b is string => b !== null);

  const facts: [string, string][] = [];
  facts.push(['Date', esc(dateLine)]);
  facts.push(['Venue', esc(`${race.city}, ${race.countryName}`)]);
  facts.push([
    'Distance',
    esc(`${d.long}: ${legsLong(legs)}${legs.legs.length > 1 ? ` (${legs.total.toLocaleString('en-US')} km)` : ''}`),
  ]);
  const course = [
    race.swim ? SWIM_LONG[race.swim] : null,
    race.bike ? `${TERRAIN_LABEL[race.bike].toLowerCase()} bike` : null,
    race.run ? `${TERRAIN_LABEL[race.run].toLowerCase()} run` : null,
  ].filter((c): c is string => c !== null);
  if (course.length) {
    const text = course.join(', ');
    facts.push(['Course', esc(text[0]!.toUpperCase() + text.slice(1))]);
  }
  if (race.nextEdition) facts.push(['Entry', esc(ENTRY_EXPLAINER[race.entry])]);
  if (reg) {
    const status = `${REGISTRATION_WORDS[reg.status]} ${asOfText(reg.checkedAt, today, { year: true })}. ${REGISTRATION_EXPLAINER[reg.status]}`;
    const where = REGISTRATION_METHOD_INFO[reg.method].where;
    facts.push([
      'Registration',
      `${esc(status)} <span class="faint">(${esc(where)}${reg.url ? `; <a href="${esc(reg.url)}" rel="noopener">entry page</a>` : ''})</span>`,
    ]);
  }
  if (race.championship) facts.push(['Championship', esc(race.championship)]);
  if (race.notes) facts.push(['Notes', esc(race.notes)]);
  if (successor) {
    facts.push(['Continues as', `<a href="../${esc(successor.id)}/">${esc(successor.name)}</a>`]);
  }

  const editions = race.editions.map((e) => `<li>${esc(editionText(e, today))}</li>`).join('\n          ');
  const nearbyItems = nearby
    .map(
      ({ race: r, km }) =>
        `<li><a href="../${esc(r.id)}/">${esc(r.name)}</a> <span class="faint">· ${esc(DISTANCES[r.distance].badge)} · ${esc(nearbyWhen(r.nextEdition))} · ${esc(kmText(km))}</span></li>`,
    )
    .join('\n          ');
  const sources = race.sources
    .map((s) => `<li><a href="${esc(s)}" rel="noopener">${esc(s.replace(/^https:\/\/(www\.)?/, ''))}</a></li>`)
    .join('\n          ');

  const faces = [
    fonts.sans ? fontFace('Inter Variable', fonts.sans, '100 900') : '',
    fonts.display ? fontFace('Barlow Condensed', fonts.display, '700') : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(summary)}" />${
      race.nextEdition
        ? ''
        : `
    <meta name="robots" content="noindex" />`
    }
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
    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />${
      event
        ? `
    <script type="application/ld+json">${scriptJson(event)}</script>`
        : ''
    }
    <style>
      ${faces}
      :root {
        color-scheme: light dark;
        --bg: #f3f4f7; --surface: #ffffff; --line: #e2e6ec; --fg: #0c1220; --muted: #545e6f;
        --ink: #0c1220; --on-ink: #ffffff; --badge-bg: #ffedd5; --badge-fg: #7c2d12;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #080b11; --surface: #0f141d; --line: #222b39; --fg: #e9eef6; --muted: #a2acbc;
          --ink: #e9eef6; --on-ink: #0a0e15; --badge-bg: rgb(251 146 60 / 0.15); --badge-fg: #fed7aa;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font: 15px/1.55 'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      }
      a { color: inherit; text-underline-offset: 2px; }
      .wrap { max-width: 44rem; margin: 0 auto; padding: 16px; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 4px 16px; }
      .home { font: 700 22px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.01em; text-decoration: none; }
      .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
      .head { display: flex; gap: 14px; align-items: flex-start; }
      .head svg { width: 44px; height: 44px; flex: none; }
      .eyebrow { margin: 0; color: var(--muted); font-size: 13px; font-weight: 600; }
      h1 { margin: 2px 0 4px; font: 700 34px/1.05 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; }
      .lede { margin: 0; color: var(--muted); }
      .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
      .badges li { background: var(--badge-bg); color: var(--badge-fg); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }
      .btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 12px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); }
      .btn.primary { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
      dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }
      dt { color: var(--muted); }
      dd { margin: 0; }
      h2 { margin: 0 0 10px; font: 700 20px/1.2 'Barlow Condensed', 'Arial Narrow', sans-serif; }
      ul.plain { margin: 0; padding-left: 18px; }
      ul.plain li + li { margin-top: 4px; }
      .faint { color: var(--muted); }
      .sources a { overflow-wrap: anywhere; }
      footer { color: var(--muted); font-size: 12px; padding: 4px 4px 24px; }
      @media (max-width: 480px) {
        dl { grid-template-columns: 1fr; gap: 2px; }
        dd { margin-bottom: 8px; }
        h1 { font-size: 30px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <a class="home" href="../../">TriMap</a>
        <a href="../../">All races on the map</a>
      </header>
      <main>
        <section class="card" aria-labelledby="race-name">
          <div class="head">
            ${brandGlyphSvg(race.brand, { title: brand.label })}
            <div>
              <p class="eyebrow">${esc(seriesLabel(race, brand.label))} · ${esc(d.badgeLong)}</p>
              <h1 id="race-name">${esc(race.name)}</h1>
              <p class="lede">${esc(dateLine)} · ${esc(`${race.city}, ${race.countryName}`)}</p>
            </div>
          </div>${
            badges.length
              ? `
          <ul class="badges">${badges.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
              : ''
          }
          <p class="actions">
            <a class="btn primary" href="${esc(app)}">Open on the map</a>
            <a class="btn" href="${esc(race.url)}" rel="noopener">Official website</a>
          </p>
        </section>
        <section class="card" aria-label="Race details">
          <dl>
            ${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('\n            ')}
          </dl>
        </section>
        <section class="card" aria-labelledby="editions">
          <h2 id="editions">Editions</h2>
          <ul class="plain">
          ${editions}
          </ul>
        </section>${
          nearbyItems
            ? `
        <section class="card" aria-labelledby="nearby">
          <h2 id="nearby">Races nearby</h2>
          <ul class="plain">
          ${nearbyItems}
          </ul>
        </section>`
            : ''
        }
        <section class="card sources" aria-labelledby="sources">
          <h2 id="sources">Sources</h2>
          <ul class="plain">
          ${sources}
          </ul>
          <p class="faint">Dates checked ${esc(formatDate(race.verifiedAt))}.</p>
        </section>
      </main>
      <footer>
        Dates can change; always confirm on the official website. TriMap is not affiliated with IRONMAN,
        Challenge Family, PTO/T100, World Triathlon or XTERRA.
      </footer>
    </div>
  </body>
</html>
`;
}
