/**
 * Filter state and pure filtering logic. Every function here is deterministic given
 * `today`, so it is unit-tested without a browser.
 */
import { BRAND_IDS, DISTANCE_IDS, type BrandId, type DistanceId } from '../data/brands.ts';
import { REGION_IDS, type RegionId } from '../data/regions.ts';
import type { Race } from '../data/types.ts';
import { addMonths, formatMonthShort, monthKeyOf, monthRange, type ISODate, type MonthKey } from './dates.ts';
import { inBounds, type Bounds } from './geo.ts';
import { matchesTokens, tokenize } from './search.ts';

export const TIME_PRESETS = ['3m', '6m', 'year', 'next-year'] as const;
export type TimePreset = (typeof TIME_PRESETS)[number];

export const TIME_PRESET_LABELS: Record<TimePreset, string> = {
  '3m': 'Next 3 months',
  '6m': 'Next 6 months',
  year: 'Rest of this year',
  'next-year': 'Next year',
};

export type TimeFilter =
  { kind: 'any' } | { kind: 'preset'; preset: TimePreset } | { kind: 'range'; from: MonthKey; to: MonthKey };

export type SortKey = 'date' | 'name';

export interface Filters {
  q: string;
  distances: DistanceId[];
  brands: BrandId[];
  regions: RegionId[];
  time: TimeFilter;
  /** Include races whose next date is only estimated. */
  showEstimated: boolean;
  /** Restrict to the current map viewport. */
  inMapArea: boolean;
  shortlistOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = Object.freeze({
  q: '',
  distances: [],
  brands: [],
  regions: [],
  time: { kind: 'any' },
  showEstimated: true,
  inMapArea: false,
  shortlistOnly: false,
  sort: 'date',
}) as Filters;

export interface FilterContext {
  today: ISODate;
  /** Current map viewport; null until the map has reported one. */
  bounds: Bounds | null;
  shortlist: ReadonlySet<string>;
}

export type Dimension = 'q' | 'distance' | 'brand' | 'region' | 'time' | 'estimated' | 'area' | 'shortlist';

export interface MonthRangeValue {
  from: MonthKey;
  to: MonthKey;
}

/** Resolve presets relative to today. Month granularity; the current month is included. */
export function resolveTimeRange(time: TimeFilter, today: ISODate): MonthRangeValue | null {
  const now = monthKeyOf(today);
  switch (time.kind) {
    case 'any':
      return null;
    case 'range':
      return time.from <= time.to ? { from: time.from, to: time.to } : { from: time.to, to: time.from };
    case 'preset': {
      const year = today.slice(0, 4);
      switch (time.preset) {
        case '3m':
          return { from: now, to: addMonths(now, 3) };
        case '6m':
          return { from: now, to: addMonths(now, 6) };
        case 'year':
          return { from: now, to: `${year}-12` };
        case 'next-year': {
          const next = String(Number(year) + 1);
          return { from: `${next}-01`, to: `${next}-12` };
        }
      }
    }
  }
}

export function describeTime(time: TimeFilter, today: ISODate): string {
  if (time.kind === 'any') return 'Any time';
  if (time.kind === 'preset') return TIME_PRESET_LABELS[time.preset];
  const r = resolveTimeRange(time, today)!;
  return r.from === r.to ? formatMonthShort(r.from) : `${formatMonthShort(r.from)} – ${formatMonthShort(r.to)}`;
}

interface Prepared {
  tokens: string[];
  distances: ReadonlySet<DistanceId> | null;
  brands: ReadonlySet<BrandId> | null;
  regions: ReadonlySet<RegionId> | null;
  range: MonthRangeValue | null;
}

function prepare(filters: Filters, today: ISODate): Prepared {
  const set = <T>(xs: readonly T[], all: readonly T[]) => (xs.length && xs.length < all.length ? new Set(xs) : null);
  return {
    tokens: tokenize(filters.q),
    distances: set(filters.distances, DISTANCE_IDS),
    brands: set(filters.brands, BRAND_IDS),
    regions: set(filters.regions, REGION_IDS),
    range: resolveTimeRange(filters.time, today),
  };
}

function matches(race: Race, filters: Filters, p: Prepared, ctx: FilterContext, skip: ReadonlySet<Dimension>): boolean {
  if (!skip.has('q') && p.tokens.length && !matchesTokens(race.searchText, p.tokens)) return false;
  if (!skip.has('distance') && p.distances && !p.distances.has(race.distance)) return false;
  if (!skip.has('brand') && p.brands && !p.brands.has(race.brand)) return false;
  if (!skip.has('region') && p.regions && !p.regions.has(race.region)) return false;
  const next = race.nextEdition;
  if (!skip.has('estimated') && !filters.showEstimated && (!next || next.estimated)) return false;
  if (!skip.has('time') && p.range) {
    if (!next) return false;
    const m = monthKeyOf(next.date);
    if (m < p.range.from || m > p.range.to) return false;
  }
  if (!skip.has('shortlist') && filters.shortlistOnly && !ctx.shortlist.has(race.id)) return false;
  if (!skip.has('area') && filters.inMapArea && ctx.bounds && !inBounds(race.lng, race.lat, ctx.bounds)) return false;
  return true;
}

export function filterRaces(
  races: readonly Race[],
  filters: Filters,
  ctx: FilterContext,
  skip: readonly Dimension[] = [],
): Race[] {
  const p = prepare(filters, ctx.today);
  const s = new Set(skip);
  return races.filter((r) => matches(r, filters, p, ctx, s));
}

export interface FacetCounts {
  distance: Record<DistanceId, number>;
  brand: Record<BrandId, number>;
  region: Record<RegionId, number>;
}

/** Counts per option, each computed with every filter applied except its own dimension. */
export function facetCounts(races: readonly Race[], filters: Filters, ctx: FilterContext): FacetCounts {
  const count = <K extends string>(dim: Dimension, keys: readonly K[], get: (r: Race) => K) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    for (const r of filterRaces(races, filters, ctx, [dim])) out[get(r)]++;
    return out;
  };
  return {
    distance: count('distance', DISTANCE_IDS, (r) => r.distance),
    brand: count('brand', BRAND_IDS, (r) => r.brand),
    region: count('region', REGION_IDS, (r) => r.region),
  };
}

export interface MonthBucket {
  key: MonthKey;
  /** Races with a known (confirmed or tentative) date in this month. */
  count: number;
  /** Races whose estimated next date falls in this month. */
  estimated: number;
}

/**
 * Month histogram from the current month to the last month with data (at least
 * `minMonths` long). The axis comes from all races so it does not jump while filtering;
 * the counts use every filter except time.
 */
export function monthHistogram(
  allRaces: readonly Race[],
  filters: Filters,
  ctx: FilterContext,
  minMonths = 12,
): MonthBucket[] {
  const start = monthKeyOf(ctx.today);
  let end = addMonths(start, minMonths - 1);
  for (const r of allRaces) {
    if (!r.nextEdition) continue;
    const m = monthKeyOf(r.nextEdition.date);
    if (m > end) end = m;
  }
  const buckets = monthRange(start, end).map((key) => ({ key, count: 0, estimated: 0 }));
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of filterRaces(allRaces, filters, ctx, ['time'])) {
    if (!r.nextEdition) continue;
    const i = index.get(monthKeyOf(r.nextEdition.date));
    if (i === undefined) continue;
    if (r.nextEdition.estimated) buckets[i]!.estimated++;
    else buckets[i]!.count++;
  }
  return buckets;
}

const byName = (a: Race, b: Race) => a.name.localeCompare(b.name, 'en') || a.distance.localeCompare(b.distance);

export function sortRaces(races: readonly Race[], sort: SortKey): Race[] {
  const out = [...races];
  if (sort === 'name') return out.sort(byName);
  return out.sort((a, b) => {
    const da = a.nextEdition?.date;
    const db = b.nextEdition?.date;
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    }
    return byName(a, b);
  });
}

export interface RaceGroup {
  /** Month key, or 'tba' for races without any next date. */
  key: string;
  races: Race[];
}

/** Consecutive runs of races that share a month (input should be date-sorted). */
export function groupByMonth(races: readonly Race[]): RaceGroup[] {
  const groups: RaceGroup[] = [];
  for (const r of races) {
    const key = r.nextEdition ? monthKeyOf(r.nextEdition.date) : 'tba';
    const last = groups.at(-1);
    if (last && last.key === key) last.races.push(r);
    else groups.push({ key, races: [r] });
  }
  return groups;
}

export function isDefaultFilters(f: Filters): boolean {
  return activeDimensions(f).length === 0;
}

/** The filter dimensions that currently narrow the results (sort excluded). */
export function activeDimensions(f: Filters): Dimension[] {
  const out: Dimension[] = [];
  if (f.q.trim()) out.push('q');
  if (f.distances.length && f.distances.length < DISTANCE_IDS.length) out.push('distance');
  if (f.brands.length && f.brands.length < BRAND_IDS.length) out.push('brand');
  if (f.regions.length && f.regions.length < REGION_IDS.length) out.push('region');
  if (f.time.kind !== 'any') out.push('time');
  if (!f.showEstimated) out.push('estimated');
  if (f.inMapArea) out.push('area');
  if (f.shortlistOnly) out.push('shortlist');
  return out;
}

export function clearDimension(f: Filters, dim: Dimension): Filters {
  switch (dim) {
    case 'q':
      return { ...f, q: '' };
    case 'distance':
      return { ...f, distances: [] };
    case 'brand':
      return { ...f, brands: [] };
    case 'region':
      return { ...f, regions: [] };
    case 'time':
      return { ...f, time: { kind: 'any' } };
    case 'estimated':
      return { ...f, showEstimated: true };
    case 'area':
      return { ...f, inMapArea: false };
    case 'shortlist':
      return { ...f, shortlistOnly: false };
  }
}

export function clearAll(f: Filters): Filters {
  return { ...DEFAULT_FILTERS, sort: f.sort };
}

export interface Relaxation {
  dimension: Dimension;
  count: number;
}

/**
 * For the empty state: which single filter, when removed, brings back the most races.
 * Sorted by resulting count, best first; only dimensions that help are returned.
 */
export function suggestRelaxations(races: readonly Race[], filters: Filters, ctx: FilterContext): Relaxation[] {
  return activeDimensions(filters)
    .map((dimension) => ({ dimension, count: filterRaces(races, filters, ctx, [dimension]).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Toggle a value in a multi-select where "nothing selected" means "everything". Selecting
 * the last missing value collapses back to the empty (all) state.
 */
export function toggleValue<T>(selected: readonly T[], value: T, all: readonly T[]): T[] {
  const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  if (next.length >= all.length) return [];
  return all.filter((v) => next.includes(v));
}
