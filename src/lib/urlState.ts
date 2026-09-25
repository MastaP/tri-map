/**
 * Filters and the selected race ⇄ URL query string, so every search is shareable.
 *
 *   ?q=roth&dist=full,half&brand=ironman&region=europe,asia&when=6m
 *   ?from=2026-10&to=2027-03&open=1&bike=flat,rolling&run=flat
 *   &est=1&area=1&bbox=4.1,51.9,6.3,52.8&star=1&sort=near&race=<id>
 *
 * `est=1` shows estimated dates (off by default; the old `est=0` is read as off).
 *
 * `bbox` (the map area west,south,east,north) is only written with `area=1`, so a shared
 * "in map area" search shows the same races to whoever opens it, whatever the size of
 * their screen. Older links carry the map centre and zoom instead (`at=lat,lng,zoom`);
 * they are still read.
 *
 * Defaults are omitted; unknown or malformed values are ignored.
 */
import { BRAND_IDS, DISTANCE_IDS, isBrandId, isDistanceId } from '../data/brands.ts';
import { isRegionId, REGION_IDS } from '../data/regions.ts';
import { TERRAINS, type Terrain } from '../data/constants.ts';
import { isMonthKey } from './dates.ts';
import { normalizeBounds, type Bounds, type MapViewState } from './geo.ts';
import {
  DEFAULT_FILTERS,
  SORT_KEYS,
  TIME_PRESETS,
  type Filters,
  type SortKey,
  type TimeFilter,
  type TimePreset,
} from './filters.ts';

export interface UrlState {
  filters: Filters;
  raceId: string | null;
  /** The map area of an "in map area" search (`bbox`). */
  bounds?: Bounds | null;
  /** An older "in map area" link's map centre and zoom (`at`), when it has no `bbox`. */
  view?: MapViewState | null;
}

function parseView(raw: string | null): MapViewState | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng, zoom] = parts as [number, number, number];
  if (Math.abs(lat) > 85 || Math.abs(lng) > 180 || zoom < -2 || zoom > 22) return null;
  return { lat, lng, zoom };
}

function parseBounds(raw: string | null): Bounds | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  if (south < -90 || north > 90 || south >= north) return null;
  if (west < -180 || west > 180 || east <= west || east - west > 360) return null;
  return [west, south, east, north];
}

/** Rounded outwards to 3 decimals (about 100 m), so the box still holds every race it held. */
function formatBounds(b: Bounds): string {
  const [west, south, east, north] = normalizeBounds(b);
  const down = (n: number) => String(Math.floor(Math.round(n * 1e6) / 1e3) / 1e3);
  const up = (n: number) => String(Math.ceil(Math.round(n * 1e6) / 1e3) / 1e3);
  return `${down(west)},${down(south)},${up(east)},${up(north)}`;
}

function list<T extends string>(
  raw: string | null,
  guard: (s: string) => s is T,
  order: readonly T[],
  { collapseAll = true }: { collapseAll?: boolean } = {},
): T[] {
  if (!raw) return [];
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(guard),
  );
  if (collapseAll && set.size >= order.length) return [];
  return order.filter((v) => set.has(v));
}

const isTerrain = (s: string): s is Terrain => (TERRAINS as readonly string[]).includes(s);
const isSortKey = (s: string | null): s is SortKey => s !== null && (SORT_KEYS as readonly string[]).includes(s);

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  let time: TimeFilter = { kind: 'any' };
  const when = p.get('when');
  const from = p.get('from');
  const to = p.get('to');
  if (when && (TIME_PRESETS as readonly string[]).includes(when)) {
    time = { kind: 'preset', preset: when as TimePreset };
  } else if (from && isMonthKey(from)) {
    const end = to && isMonthKey(to) ? to : from;
    time = from <= end ? { kind: 'range', from, to: end } : { kind: 'range', from: end, to: from };
  }
  const race = p.get('race');
  const sort = p.get('sort');
  const area = p.get('area') === '1';
  const bounds = parseBounds(p.get('bbox'));
  return {
    filters: {
      q: (p.get('q') ?? '').slice(0, 100),
      distances: list(p.get('dist'), isDistanceId, DISTANCE_IDS),
      brands: list(p.get('brand'), isBrandId, BRAND_IDS),
      regions: list(p.get('region'), isRegionId, REGION_IDS),
      time,
      openOnly: p.get('open') === '1',
      // Every profile selected still means "has course info", so it is kept as is.
      bike: list(p.get('bike'), isTerrain, TERRAINS, { collapseAll: false }),
      run: list(p.get('run'), isTerrain, TERRAINS, { collapseAll: false }),
      // Off unless asked for; old links carry "est=0" for off, which is now the default.
      showEstimated: p.get('est') === '1',
      inMapArea: p.get('area') === '1',
      shortlistOnly: p.get('star') === '1',
      sort: isSortKey(sort) ? sort : DEFAULT_FILTERS.sort,
    },
    raceId: race && /^[a-z0-9-]{3,120}$/.test(race) ? race : null,
    bounds: area ? bounds : null,
    view: area && !bounds ? parseView(p.get('at')) : null,
  };
}

/** Query string without the leading "?" ("" when everything is default). */
export function serializeUrlState({ filters: f, raceId, bounds }: UrlState): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.distances.length) p.set('dist', f.distances.join(','));
  if (f.brands.length) p.set('brand', f.brands.join(','));
  if (f.regions.length) p.set('region', f.regions.join(','));
  if (f.time.kind === 'preset') p.set('when', f.time.preset);
  if (f.time.kind === 'range') {
    p.set('from', f.time.from);
    if (f.time.to !== f.time.from) p.set('to', f.time.to);
  }
  if (f.openOnly) p.set('open', '1');
  if (f.bike.length) p.set('bike', f.bike.join(','));
  if (f.run.length) p.set('run', f.run.join(','));
  if (f.showEstimated) p.set('est', '1');
  if (f.inMapArea) {
    p.set('area', '1');
    if (bounds) p.set('bbox', formatBounds(bounds));
  }
  if (f.shortlistOnly) p.set('star', '1');
  if (f.sort !== DEFAULT_FILTERS.sort) p.set('sort', f.sort);
  if (raceId) p.set('race', raceId);
  // Keep commas readable in shared links.
  return p.toString().replace(/%2C/g, ',');
}
