/**
 * Filters and the selected race ⇄ URL query string, so every search is shareable.
 *
 *   ?q=roth&dist=full,half&brand=ironman&region=europe,asia&when=6m
 *   ?from=2026-10&to=2027-03&est=0&area=1&star=1&sort=name&race=<id>
 *
 * Defaults are omitted; unknown or malformed values are ignored.
 */
import { BRAND_IDS, DISTANCE_IDS, isBrandId, isDistanceId } from '../data/brands.ts';
import { isRegionId, REGION_IDS } from '../data/regions.ts';
import { isMonthKey } from './dates.ts';
import { DEFAULT_FILTERS, TIME_PRESETS, type Filters, type TimeFilter, type TimePreset } from './filters.ts';

export interface UrlState {
  filters: Filters;
  raceId: string | null;
}

function list<T extends string>(raw: string | null, guard: (s: string) => s is T, order: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(guard),
  );
  if (set.size >= order.length) return [];
  return order.filter((v) => set.has(v));
}

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
  return {
    filters: {
      q: (p.get('q') ?? '').slice(0, 100),
      distances: list(p.get('dist'), isDistanceId, DISTANCE_IDS),
      brands: list(p.get('brand'), isBrandId, BRAND_IDS),
      regions: list(p.get('region'), isRegionId, REGION_IDS),
      time,
      showEstimated: p.get('est') !== '0',
      inMapArea: p.get('area') === '1',
      shortlistOnly: p.get('star') === '1',
      sort: p.get('sort') === 'name' ? 'name' : DEFAULT_FILTERS.sort,
    },
    raceId: race && /^[a-z0-9-]{3,120}$/.test(race) ? race : null,
  };
}

/** Query string without the leading "?" ("" when everything is default). */
export function serializeUrlState({ filters: f, raceId }: UrlState): string {
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
  if (!f.showEstimated) p.set('est', '0');
  if (f.inMapArea) p.set('area', '1');
  if (f.shortlistOnly) p.set('star', '1');
  if (f.sort !== DEFAULT_FILTERS.sort) p.set('sort', f.sort);
  if (raceId) p.set('race', raceId);
  // Keep commas readable in shared links.
  return p.toString().replace(/%2C/g, ',');
}
