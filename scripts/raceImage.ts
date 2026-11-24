/**
 * The share image of a race (race/<id>/og.jpg, 1200 × 630): what chat apps and social
 * sites show for a link to its page. It names the race, its next announced date, the
 * venue and the distance, over a small map of the region with the races around it.
 * Built as an HTML page and screenshotted by scripts/race-images.ts.
 *
 * Like the race page, it only states announced dates. It leaves out anything that changes
 * within days (registration status, "in 5 weeks"), because chat apps cache a preview for
 * a long time.
 */
import { BRANDS, brandGlyphSvg, DISTANCES } from '../src/data/brands.ts';
import { isNearStandard, legsText, raceLegs } from '../src/data/course.ts';
import type { Race } from '../src/data/types.ts';
import { formatDate, formatDateRange, type ISODate } from '../src/lib/dates.ts';
import { courseSummary, ENTRY_BADGE, seriesLabel } from '../src/lib/raceText.ts';
import { lastHeld } from './racePages.ts';
import { regionMapSvg, type WorldOutlines } from './regionMap.ts';

export const RACE_IMAGE = { width: 1200, height: 630 } as const;

const BG = '#0c1220';
const ACCENT = '#c4f031';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The TriMap mark, as in the header (src/components/Icons.tsx LogoMark). */
const LOGO_MARK = `<svg viewBox="0 0 32 32" width="38" height="38" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="${BG}"/>
  <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#2a3446"/>
  <path d="M7.5 23.5c2.6 0 3.6-2.2 5-4.6s2.6-4.4 5-4.4 3.4 1.8 5.6-1" fill="none" stroke="${ACCENT}" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="7.5" cy="23.5" r="2.2" fill="${ACCENT}"/>
  <path d="M24.5 5.5a4 4 0 0 1 4 4c0 3-4 6.5-4 6.5s-4-3.5-4-6.5a4 4 0 0 1 4-4Z" fill="${ACCENT}"/>
  <circle cx="24.5" cy="9.5" r="1.4" fill="${BG}"/>
</svg>`;

/** The date line: the next announced date, else when it was last held, else that none is planned. */
export function raceImageDate(race: Race, today: ISODate): { text: string; muted: boolean; note?: string } {
  const next = race.nextEdition;
  if (next && !next.estimated) {
    return {
      text: formatDateRange(next.date, next.endDate),
      muted: false,
      note: next.status === 'tentative' ? 'date to be confirmed' : undefined,
    };
  }
  const held = lastHeld(race, today);
  if (next) return { text: 'Next date TBA', muted: true, note: held ? `last held ${formatDate(held)}` : undefined };
  return { text: 'No future edition', muted: true };
}

export interface RaceImageOptions {
  today: ISODate;
  /** All races, for the dots on the map. */
  races: readonly Race[];
  world: WorldOutlines;
  /** Shown in the corner, e.g. "trimap.live". */
  host: string;
  /** The country's flag, as a data: URL. */
  flag?: string;
  /** Font files as data: URLs; system fonts without them. */
  fonts: { inter?: string; barlow?: string };
}

export function raceImageHtml(race: Race, opts: RaceImageOptions): string {
  const { width, height } = RACE_IMAGE;
  const d = DISTANCES[race.distance];
  const brand = BRANDS[race.brand];
  const date = raceImageDate(race, opts.today);
  const legs = raceLegs(race);
  const chips = [
    `${isNearStandard(race) ? `${d.long} (non-standard)` : d.long} · ${legsText(legs)}`,
    race.nextEdition ? (race.entry === 'open' ? 'Open entry' : ENTRY_BADGE[race.entry]) : null,
    courseSummary(race) || null,
  ].filter((c): c is string => c !== null);
  const map = regionMapSvg(
    race,
    opts.races,
    opts.world,
    // About 20° of longitude across the right half, the race a little above the middle.
    { width, height, x: 905, y: 290, k: 1700 },
    { land: '#1a2641', coast: '#34445f', border: '#33425d', ring: BG, accent: ACCENT },
  );
  const face = (family: string, src: string | undefined, weight: string) =>
    src ? `@font-face { font-family: '${family}'; src: url(${src}) format('woff2'); font-weight: ${weight}; }` : '';
  const capitalised = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  ${face('Inter', opts.fonts.inter, '100 900')}
  ${face('Barlow Condensed', opts.fonts.barlow, '700')}
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    position: relative;
    background: ${BG};
    color: #ffffff;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .map { position: absolute; inset: 0; }
  .fade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, ${BG} 0%, ${BG} 44%, rgba(12, 18, 32, 0.82) 54%, rgba(12, 18, 32, 0) 74%),
      linear-gradient(0deg, rgba(12, 18, 32, 0.7) 0%, rgba(12, 18, 32, 0) 22%);
  }
  .content { position: absolute; left: 68px; top: 60px; bottom: 60px; width: 640px; display: flex; flex-direction: column; }
  .eyebrow { display: flex; align-items: center; gap: 14px; font-size: 23px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #c8cfdb; }
  .eyebrow svg { width: 42px; height: 42px; display: block; flex: none; }
  h1 { margin-top: 22px; font: 700 100px/0.95 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.2px; overflow-wrap: break-word; }
  .date { margin-top: 22px; font: 700 54px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; color: ${ACCENT}; }
  .date.muted { color: #e6eaf0; }
  .note { margin-top: 8px; font-size: 22px; color: #a9b2c1; }
  .place { margin-top: 18px; display: flex; align-items: center; gap: 14px; font-size: 29px; font-weight: 500; color: #e6eaf0; }
  .place img { width: 40px; height: 30px; border-radius: 4px; display: block; flex: none; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15); }
  .chips { margin-top: auto; display: flex; flex-wrap: wrap; gap: 10px; }
  .chip { padding: 9px 16px; border-radius: 999px; border: 1.5px solid #2f3b52; background: rgba(12, 18, 32, 0.85); font-size: 21px; font-weight: 600; color: #dfe4ec; white-space: nowrap; }
  .chip.distance { border-color: ${ACCENT}; color: ${ACCENT}; }
  .site { position: absolute; right: 44px; bottom: 40px; display: flex; align-items: center; gap: 12px; padding: 8px 16px 8px 8px; border-radius: 14px; background: rgba(12, 18, 32, 0.8); font-size: 24px; font-weight: 600; color: #e6eaf0; }
  .site svg { display: block; }
</style>
</head>
<body>
  ${map}
  <div class="fade"></div>
  <div class="content">
    <div class="eyebrow">${brandGlyphSvg(race.brand, { ring: BG })}<span>${esc(seriesLabel(race, brand.label))}</span></div>
    <h1>${esc(race.name)}</h1>
    <div class="date${date.muted ? ' muted' : ''}">${esc(date.text)}</div>
    ${date.note ? `<div class="note">${esc(capitalised(date.note))}</div>` : ''}
    <div class="place">${opts.flag ? `<img src="${opts.flag}" alt="">` : ''}<span>${esc(`${race.city}, ${race.countryName}`)}</span></div>
    <div class="chips">${chips.map((c, i) => `<span class="chip${i === 0 ? ' distance' : ''}">${esc(capitalised(c))}</span>`).join('')}</div>
  </div>
  <div class="site">${LOGO_MARK}<span>${esc(opts.host)}</span></div>
  <script>
    // Size the title: one line from 100px down to 72px, else two lines from 84px, else
    // three from 64px, always with the whole card inside the image (measured once the
    // fonts have loaded). As a last resort the course chip goes; "overflow" tells
    // scripts/race-images.ts that it still does not fit.
    Promise.all([
      document.fonts.load("700 100px 'Barlow Condensed'"),
      document.fonts.load("500 29px 'Inter'"),
    ]).then(() => {
      const h = document.querySelector('h1');
      const content = document.querySelector('.content');
      const chips = document.querySelector('.chips');
      let size = 100;
      const setSize = (px) => (h.style.fontSize = (size = px) + 'px');
      // Barlow's glyphs reach a little past its 0.95 line height, hence the slack.
      const fits = (lines) =>
        h.scrollHeight <= size * 0.95 * (lines + 0.4) &&
        h.scrollWidth <= h.clientWidth &&
        content.scrollHeight <= content.clientHeight + 1;
      const fit = (lines, from, min) => {
        setSize(from);
        while (!fits(lines) && size > min) setSize(size - 2);
        return fits(lines);
      };
      const fitAll = () => fit(1, 100, 72) || fit(2, 84, 56) || fit(3, 64, 44);
      let ok = fitAll();
      while (!ok && chips.children.length > 1) {
        chips.lastElementChild.remove();
        ok = fitAll();
      }
      document.body.dataset.ready = ok ? '1' : 'overflow';
    });
  </script>
</body>
</html>
`;
}
