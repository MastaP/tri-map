import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { raceImageDate, raceImageHtml } from '../../scripts/raceImage.ts';
import { loadWorld, outlinePaths, projectPoint, regionMapSvg, type WorldOutlines } from '../../scripts/regionMap.ts';
import { fixtureRaces, TODAY } from './helpers.ts';

const races = fixtureRaces();
const race = (id: string) => races.find((r) => r.id === id)!;
const world = loadWorld(
  readFileSync(join(import.meta.dirname, '../../node_modules/world-atlas/countries-50m.json'), 'utf8'),
);
const html = (id: string) => raceImageHtml(race(id), { today: TODAY, races, world, host: 'trimap.live', fonts: {} });
/** The text of the image, tags and the map dropped. */
const text = (page: string) =>
  page
    .slice(page.indexOf('<div class="content">'))
    .replace(/<script>[\s\S]*<\/script>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

describe('race share images', () => {
  it('state only an announced date', () => {
    expect(raceImageDate(race('ironman-frankfurt-full'), TODAY)).toEqual({ text: 'Sun 27 Jun 2027', muted: false });
    expect(raceImageDate(race('independent-norseman-full'), TODAY)).toMatchObject({ note: 'date to be confirmed' });
    // Roth's next date is only estimated: not stated.
    expect(raceImageDate(race('challenge-roth-full'), TODAY)).toEqual({
      text: 'Next date TBA',
      muted: true,
      note: 'last held Sun 5 Jul 2026',
    });
    expect(raceImageDate(race('challenge-wanaka-half'), TODAY)).toEqual({ text: 'No future edition', muted: true });
  });

  it('name the race, its venue, distance, entry and course', () => {
    expect(text(html('independent-celtman-full'))).toBe(
      'Xtri World Tour Celtman Extreme Scottish Triathlon Sat 19 Jun 2027 Shieldaig, United Kingdom Full distance (non-standard) · 3.4 / 202 / 41 km Ballot Hilly bike, mountainous run trimap.live',
    );
    expect(text(html('ironman-frankfurt-full'))).toContain('Full distance · 3.8 / 180 / 42.2 km Open entry');
  });

  it('escape the race name', () => {
    const r = { ...race('ironman-frankfurt-full'), name: 'IRONMAN <b>x</b>' };
    const page = raceImageHtml(r, { today: TODAY, races, world, host: 'trimap.live', fonts: {} });
    expect(page).toContain('<h1>IRONMAN &lt;b&gt;x&lt;/b&gt;</h1>');
  });
});

describe('region map', () => {
  const view = { width: 1200, height: 630, x: 900, y: 300, k: 1700 };
  const colors = { land: '#111', coast: '#222', border: '#333', ring: '#000', accent: '#0f0' };
  const landPath = (svg: string) => svg.match(/<path d="([^"]*)" fill="#111"/)![1]!;
  const xs = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
  const at = (lng: number, lat: number) => ({ ...race('ironman-frankfurt-full'), lng, lat });

  it('keeps land across the 180° meridian next to a race on the other side', () => {
    // An island just east of 180° (as Natural Earth cuts it), seen from 179° E.
    const island: WorldOutlines = {
      land: [
        [
          [-179.8, -16],
          [-179.2, -16],
          [-179.2, -16.6],
          [-179.8, -16],
        ],
      ],
      borders: [],
    };
    const xsOf = xs(landPath(regionMapSvg(at(179, -16.5), [], island, view, colors)));
    expect(Math.min(...xsOf)).toBeGreaterThan(view.x);
    expect(Math.max(...xsOf)).toBeLessThan(view.x + 100);
  });

  /** The land path's rings, as projected points. */
  const rings = (d: string) =>
    d
      .split('M')
      .filter(Boolean)
      .map((sub) =>
        sub
          .replace('Z', '')
          .split('L')
          .map((pt) => pt.split(' ').map(Number) as [number, number]),
      );
  /** Even-odd point-in-polygon, as the SVG fills it. */
  const inside = (pt: [number, number], rs: [number, number][][]) => {
    let hit = false;
    for (const ring of rs) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
      }
    }
    return hit;
  };
  const RAD = Math.PI / 180;
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));

  it.each([
    // Åre (Swedeman), next to the ring of Afro-Eurasia that crosses ±180° to reach Chukotka.
    { at: [13.08, 63.4], land: [20.22, 67.86], sea: [6, 67] },
    { at: [2.17, 41.39], land: [-3.7, 40.42], sea: [4, 40.5] },
    { at: [176.07, -38.69], land: [175.28, -37.79], sea: [179, -39] },
    { at: [-155.99, 19.64], land: [-155.47, 19.82], sea: [-157, 19] },
  ])('fills the real coastlines the right way round near $at', ({ at: [lng0, lat0], land, sea }) => {
    const rs = rings(landPath(regionMapSvg(at(lng0!, lat0!), [], world, view, colors)));
    // No ring jumps across the map.
    for (const ring of rs) {
      for (let i = 1; i < ring.length; i++) expect(Math.abs(ring[i]![0] - ring[i - 1]![0])).toBeLessThan(300);
    }
    const px = ([lng, lat]: number[]): [number, number] => [
      view.x + (lng! - lng0!) * RAD * view.k,
      view.y - (mercY(lat!) - mercY(lat0!)) * view.k,
    ];
    expect(inside(px(land), rs)).toBe(true);
    expect(inside(px(sea), rs)).toBe(false);
  });

  it('draws land on both sides of the wrap on a map as wide as the world', () => {
    // A world map centred on 40° E: Anchorage's marker is at the right edge, and so must
    // be the land of Alaska (North America's outline is otherwise drawn at the left).
    const world360 = { width: 800, height: 380, x: 400, y: 190, k: 127 };
    const rs = rings(outlinePaths(world, 40, 20, world360).land);
    const anchorage = projectPoint(-149.9, 61.2, 40, 20, world360);
    expect(anchorage[0]).toBeGreaterThan(700);
    expect(inside(anchorage, rs)).toBe(true);
    expect(inside(projectPoint(-100, 40, 40, 20, world360), rs)).toBe(true); // Kansas, on the left
  });

  it('draws a continent that reaches 180° from its western end, and skips land out of view', () => {
    // A continent from 9.5° W to 180° (with points every 10°, as real coastlines have
    // dense points), and an island on the far side of the world.
    const lngs = [-9.5, ...Array.from({ length: 19 }, (_, i) => i * 10)];
    const outlines: WorldOutlines = {
      land: [
        [
          ...lngs.map((lng): [number, number] => [lng, 37]),
          ...lngs.reverse().map((lng): [number, number] => [lng, 45]),
        ],
        [
          [-150, 20],
          [-149, 20],
          [-149, 21],
          [-150, 20],
        ],
      ],
      borders: [],
    };
    const d = landPath(regionMapSvg(at(-9, 38.7), [], outlines, view, colors));
    expect(d.match(/M/g)).toHaveLength(1);
    expect(Math.min(...xs(d))).toBeCloseTo(view.x - 0.5 * (Math.PI / 180) * view.k, 0);
  });
});
