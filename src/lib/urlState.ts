/**
 * Filters and the selected race ⇄ URL query string, so every search is shareable.
 *
 *   ?q=roth&dist=full,half&brand=ironman&region=europe,asia&when=6m
 *   ?from=2026-10&to=2027-03&open=1&bike=flat,rolling&run=flat
 *   &est=0&area=1&at=52.37,4.9,6&star=1&sort=near&race=<id>
 *
 * `at` (map centre lat,lng and zoom) is only written with `area=1`, so a shared "in map
 * area" search shows the same races to whoever opens it.
 *
 * Defaults are omitted; unknown or malformed values are ignored.
 */
import { BRAND_IDS, DISTANCE_IDS, isBrandId, isDistanceId } from '../data/brands.ts';
import { isRegionId, REGION_IDS } from '../data/regions.ts';
import { TERRAINS, type Terrain } from '../data/constants.ts';
import { isMonthKey } from './dates.ts';
import type { MapViewState } from './geo.ts';
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
  /** Map view for an "in map area" search. */
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

const round = (n: number, digits: number) => String(Number(n.toFixed(digits)));

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
      showEstimated: p.get('est') !== '0',
      inMapArea: p.get('area') === '1',
      shortlistOnly: p.get('star') === '1',
      sort: isSortKey(sort) ? sort : DEFAULT_FILTERS.sort,
    },
    raceId: race && /^[a-z0-9-]{3,120}$/.test(race) ? race : null,
    view: p.get('area') === '1' ? parseView(p.get('at')) : null,
  };
}

/** Query string without the leading "?" ("" when everything is default). */
export function serializeUrlState({ filters: f, raceId, view }: UrlState): string {
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
  if (!f.showEstimated) p.set('est', '0');
  if (f.inMapArea) {
    p.set('area', '1');
    if (view) p.set('at', `${round(view.lat, 3)},${round(view.lng, 3)},${round(view.zoom, 1)}`);
  }
  if (f.shortlistOnly) p.set('star', '1');
  if (f.sort !== DEFAULT_FILTERS.sort) p.set('sort', f.sort);
  if (raceId) p.set('race', raceId);
  // Keep commas readable in shared links.
  return p.toString().replace(/%2C/g, ',');
}
