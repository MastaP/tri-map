/**
 * Small static maps, as SVG: land and country borders from Natural Earth (world-atlas,
 * public domain) in Web Mercator, like the app's map. `regionMapSvg` is the map of a
 * race's share image (centred on it, with the races around it as dots); `fitView` and
 * `outlinePaths` frame and draw a map of any set of races.
 */
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { BRANDS, brandGlyphSvg } from '../src/data/brands.ts';
import type { Race } from '../src/data/types.ts';

type Ring = [number, number][];

/** Land rings and country border lines, as [lng, lat] pairs. */
export interface WorldOutlines {
  land: Ring[];
  borders: Ring[];
}

/** Reads world-atlas's countries TopoJSON (objects `countries` and `land`). */
export function loadWorld(topoJson: string): WorldOutlines {
  const topo = JSON.parse(topoJson) as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
  const land: Ring[] = [];
  for (const f of feature(topo, topo.objects.land).features) {
    const g = f.geometry;
    if (g.type === 'Polygon') land.push(...(g.coordinates as Ring[]));
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) land.push(...(p as Ring[]));
  }
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b).coordinates as Ring[];
  return { land, borders };
}

export interface MapView {
  width: number;
  height: number;
  /** Where the race sits in the image, in px. */
  x: number;
  y: number;
  /** Scale: px per radian of longitude. */
  k: number;
}

const RAD = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * RAD) / 2));

/** Projects [lng, lat] to px around a centre, keeping longitudes continuous across ±180°. */
function projector(lng0: number, lat0: number, view: MapView) {
  const y0 = mercY(lat0);
  const toX = (dLng: number) => view.x + dLng * RAD * view.k;
  const toY = (lat: number) => view.y - (mercY(lat) - y0) * view.k;
  /** Longitude difference from the centre, in [-180, 180). */
  const delta = (lng: number) => wrap180(lng - lng0);
  return { toX, toY, delta };
}

const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * A ring with continuous longitudes. Some outlines cross ±180° (Afro-Eurasia reaches
 * Chukotka, then comes back): each point continues from the previous one instead of
 * jumping 360°. A ring that goes all the way round (Antarctica) is closed along the pole.
 */
export function unwrapRing(ring: Ring): Ring {
  const out: Ring = [];
  let prev: { lng: number; u: number } | null = null;
  for (const [lng, lat] of ring) {
    const u: number = prev ? prev.u + wrap180(lng - prev.lng) : lng;
    prev = { lng, u };
    out.push([u, lat]);
  }
  const first = out[0];
  const last = out.at(-1);
  if (first && last && Math.abs(last[0] - first[0]) >= 180) {
    const pole = first[1] < 0 ? -90 : 90;
    out.push([last[0], pole], [first[0], pole]);
  }
  return out;
}

export interface PathOptions {
  /** Drop a point closer than this (px) to the last one kept: lighter paths for pages. */
  thin?: number;
  /** Decimals of the coordinates. */
  digits?: number;
}

/**
 * SVG path data for rings, skipping those outside the view; `close` for polygons. Each
 * ring is unwrapped and shifted by a multiple of 360° to the side of the world nearest
 * the centre; on a map about as wide as the world, the copies 360° either side are drawn
 * too where they show (Alaska at the right edge of a map centred on Asia), so the land
 * matches `projectPoint` on both sides of the wrap.
 */
function pathData(
  rings: readonly Ring[],
  lng0: number,
  lat0: number,
  view: MapView,
  close: boolean,
  { thin = 0, digits = 1 }: PathOptions = {},
): string {
  const { toX, toY } = projector(lng0, lat0, view);
  const margin = 40;
  const turn = 360 * RAD * view.k;
  const out: string[] = [];
  for (const raw of rings) {
    const ring = unwrapRing(raw);
    let west = Infinity;
    let east = -Infinity;
    for (const [lng] of ring) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
    }
    const offset = Math.round((lng0 - (west + east) / 2) / 360) * 360;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const pts: [number, number][] = [];
    for (const [lng, lat] of ring) {
      const x = toX(lng + offset - lng0);
      const y = toY(lat);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const kept = pts.at(-1);
      if (kept && thin && Math.abs(x - kept[0]) < thin && Math.abs(y - kept[1]) < thin) continue;
      pts.push([x, y]);
    }
    if (maxY < -margin || minY > view.height + margin || (close && pts.length < 3)) continue;
    for (const shift of [-turn, 0, turn]) {
      if (maxX + shift < -margin || minX + shift > view.width + margin) continue;
      const d = pts.map(([x, y]) => `${(x + shift).toFixed(digits)} ${y.toFixed(digits)}`).join('L');
      out.push(`M${d}${close ? 'Z' : ''}`);
    }
  }
  return out.join('');
}

/** Land and border path data for a view centred on [lng0, lat0]. */
export function outlinePaths(
  world: WorldOutlines,
  lng0: number,
  lat0: number,
  view: MapView,
  opts: PathOptions = {},
): { land: string; borders: string } {
  return {
    land: pathData(world.land, lng0, lat0, view, true, opts),
    borders: pathData(world.borders, lng0, lat0, view, false, opts),
  };
}

/** Where [lng, lat] lands in a view centred on [lng0, lat0], in px. */
export function projectPoint(lng: number, lat: number, lng0: number, lat0: number, view: MapView): [number, number] {
  const { toX, toY, delta } = projector(lng0, lat0, view);
  return [toX(delta(lng)), toY(lat)];
}

/**
 * The view that frames `points` in a `width` × `height` map with `pad` px around them,
 * zoomed in no further than `maxK`. Longitudes are framed along the shortest arc, so
 * races on both sides of ±180° (Fiji and Samoa) sit side by side.
 */
export function fitView(
  points: readonly { lng: number; lat: number }[],
  width: number,
  height: number,
  pad: number,
  maxK: number,
): { lng0: number; lat0: number; view: MapView } {
  const lngs = points.map((p) => ((p.lng % 360) + 360) % 360).sort((a, b) => a - b);
  // The widest gap between neighbouring longitudes is the part of the world left out.
  let gap = lngs.length ? lngs[0]! + 360 - lngs.at(-1)! : 360;
  let west = lngs[0] ?? 0;
  for (let i = 1; i < lngs.length; i++) {
    if (lngs[i]! - lngs[i - 1]! > gap) {
      gap = lngs[i]! - lngs[i - 1]!;
      west = lngs[i]!;
    }
  }
  const arc = 360 - gap;
  const lng0 = wrap180(west + arc / 2);
  const ys = points.map((p) => mercY(p.lat));
  const north = Math.max(...ys);
  const south = Math.min(...ys);
  const yMid = (north + south) / 2;
  const lat0 = (2 * Math.atan(Math.exp(yMid)) - Math.PI / 2) / RAD;
  const k = Math.min(
    maxK,
    arc > 0 ? (width - 2 * pad) / (arc * RAD) : Infinity,
    north > south ? (height - 2 * pad) / (north - south) : Infinity,
  );
  return { lng0, lat0, view: { width, height, x: width / 2, y: height / 2, k } };
}

export interface RegionMapColors {
  land: string;
  coast: string;
  border: string;
  ring: string;
  accent: string;
}

/** The map as an <svg> the size of the view. */
export function regionMapSvg(
  race: Race,
  races: readonly Race[],
  world: WorldOutlines,
  view: MapView,
  colors: RegionMapColors,
): string {
  const { toX, toY, delta } = projector(race.lng, race.lat, view);
  const land = pathData(world.land, race.lng, race.lat, view, true);
  const borders = pathData(world.borders, race.lng, race.lat, view, false);
  const dots = races
    .filter((r) => r.id !== race.id && r.nextEdition)
    .map((r) => ({ r, x: toX(delta(r.lng)), y: toY(r.lat) }))
    .filter(({ x, y }) => x > -10 && x < view.width + 10 && y > -10 && y < view.height + 10)
    // Not on top of the race's own marker.
    .filter(({ x, y }) => Math.hypot(x - view.x, y - view.y) > 34)
    .map(
      ({ r, x, y }) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="${BRANDS[r.brand].color}" stroke="${colors.ring}" stroke-width="2"/>`,
    )
    .join('');
  const size = 64;
  const glyph = brandGlyphSvg(race.brand, { ring: '#FFFFFF' }).replace(
    '<svg ',
    `<svg x="${view.x - size / 2}" y="${view.y - size / 2}" width="${size}" height="${size}" `,
  );
  return `<svg class="map" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}" aria-hidden="true">
  <path d="${land}" fill="${colors.land}" stroke="${colors.coast}" stroke-width="1.2" fill-rule="evenodd" stroke-linejoin="round"/>
  <path d="${borders}" fill="none" stroke="${colors.border}" stroke-width="1" stroke-dasharray="4 3"/>
  ${dots}
  <circle cx="${view.x}" cy="${view.y}" r="74" fill="none" stroke="${colors.accent}" stroke-opacity="0.18" stroke-width="2"/>
  <circle cx="${view.x}" cy="${view.y}" r="50" fill="${colors.accent}" fill-opacity="0.08" stroke="${colors.accent}" stroke-opacity="0.45" stroke-width="2"/>
  ${glyph}
</svg>`;
}
