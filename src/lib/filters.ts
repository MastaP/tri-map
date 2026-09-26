/**
 * Filter state and pure filtering logic. Every function here is deterministic given
 * `today`, so it is unit-tested without a browser.
 */
import { BRAND_IDS, DISTANCE_IDS, type BrandId, type DistanceId } from '../data/brands.ts';
import { TERRAINS, type Terrain } from '../data/constants.ts';
import type { NextEdition } from '../data/nextEdition.ts';
import { REGION_IDS, type RegionId } from '../data/regions.ts';
import { HIDDEN_BY_SOLD_OUT, shownRegistration } from '../data/registration.ts';
import type { Race } from '../data/types.ts';
import { addMonths, formatMonthShort, monthKeyOf, monthRange, type ISODate, type MonthKey } from './dates.ts';
import { inBounds, type Bounds, type LngLat } from './geo.ts';
import { byDateThenName, sortByDistance } from './nearest.ts';
import { isYearToken, matchesTokens, tokenize } from './search.ts';

export const TIME_PRESETS = ['3m', '6m', '12m', 'year', 'next-year'] as const;
export type TimePreset = (typeof TIME_PRESETS)[number];

/** Long name of a preset ("Next 12 months", "Rest of 2026", "2027"). */
export function presetLabel(preset: TimePreset, today: ISODate): string {
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case '3m':
      return 'Next 3 months';
    case '6m':
      return 'Next 6 months';
    case '12m':
      return 'Next 12 months';
    case 'year':
      return `Rest of ${year}`;
    case 'next-year':
      return String(year + 1);
  }
}

/** Chip text of a preset ("12 months", "2026", "2027"). */
export function presetShortLabel(preset: TimePreset, today: ISODate): string {
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case '3m':
      return '3 months';
    case '6m':
      return '6 months';
    case '12m':
      return '12 months';
    case 'year':
      return String(year);
    case 'next-year':
      return String(year + 1);
  }
}

export type TimeFilter =
  { kind: 'any' } | { kind: 'preset'; preset: TimePreset } | { kind: 'range'; from: MonthKey; to: MonthKey };

export const SORT_KEYS = ['date', 'name', 'near'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface Filters {
  q: string;
  distances: DistanceId[];
  brands: BrandId[];
  regions: RegionId[];
  time: TimeFilter;
  /** Hide races that need a qualifying slot or a ballot place. */
  openOnly: boolean;
  /**
   * Hide races whose shown edition is sold out (a waitlist included) or closed for entries,
   * by a recent registration status. "General entry sold out" stays: charity or
   * travel-package places may remain. Races without a status are kept.
   */
  hideSoldOut: boolean;
  /**
   * Bike / run course profiles to keep. Unlike the other multi-selects, selecting every
   * profile is not the same as none: any selection drops races without that course info.
   */
  bike: Terrain[];
  run: Terrain[];
  /**
   * Also show editions whose date is only estimated from the last one. Off by default:
   * every date shown by default comes from an official source.
   */
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
  openOnly: false,
  hideSoldOut: false,
  bike: [],
  run: [],
  showEstimated: false,
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

export type Dimension =
  | 'q'
  | 'distance'
  | 'brand'
  | 'region'
  | 'time'
  | 'entry'
  | 'soldout'
  | 'bike'
  | 'run'
  | 'estimated'
  | 'area'
  | 'shortlist';

export const COURSE_DIMENSIONS = ['bike', 'run'] as const;
export type CourseDimension = (typeof COURSE_DIMENSIONS)[number];

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
        case '12m':
          return { from: now, to: addMonths(now, 12) };
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
  if (time.kind === 'preset') return presetLabel(time.preset, today);
  const r = resolveTimeRange(time, today)!;
  return r.from === r.to ? formatMonthShort(r.from) : `${formatMonthShort(r.from)} – ${formatMonthShort(r.to)}`;
}

/**
 * A date range from an old shared link: months before the current one hold no races any
 * more, so they are cut off, and a range that has passed entirely is dropped
 * (`expired`, so the UI can say so).
 */
export function clampTimeToToday(time: TimeFilter, today: ISODate): { time: TimeFilter; expired: boolean } {
  if (time.kind !== 'range') return { time, expired: false };
  const now = monthKeyOf(today);
  const r = resolveTimeRange(time, today)!;
  if (r.to < now) return { time: { kind: 'any' }, expired: true };
  if (r.from < now) return { time: { kind: 'range', from: now, to: r.to }, expired: false };
  return { time, expired: false };
}

/**
 * The month an edition counts in. A multi-day race that started last month and is still
 * running counts in the current month (it is on now).
 */
export function editionMonth(e: NextEdition, today: ISODate): MonthKey {
  return monthKeyOf(e.date < today ? today : e.date);
}

/**
 * The first upcoming edition (known, or estimated when `withEstimated`) whose month is in
 * `range` and whose year is one of `years` (when given); null when none is.
 */
export function editionInRange(
  race: Pick<Race, 'upcoming'>,
  range: MonthRangeValue | null,
  today: ISODate,
  withEstimated: boolean,
  years: readonly string[] = [],
): NextEdition | null {
  for (const e of race.upcoming) {
    if (e.estimated && !withEstimated) continue;
    const m = editionMonth(e, today);
    if (range && (m < range.from || m > range.to)) continue;
    if (years.length && !years.includes(m.slice(0, 4))) continue;
    return e;
  }
  return null;
}

interface Prepared {
  tokens: string[];
  /** Years typed into the search ("roth 2027"): the race must have an edition then. */
  years: string[];
  distances: ReadonlySet<DistanceId> | null;
  brands: ReadonlySet<BrandId> | null;
  regions: ReadonlySet<RegionId> | null;
  bike: ReadonlySet<Terrain> | null;
  run: ReadonlySet<Terrain> | null;
  range: MonthRangeValue | null;
}

function prepare(filters: Filters, today: ISODate): Prepared {
  const set = <T>(xs: readonly T[], all: readonly T[]) => (xs.length && xs.length < all.length ? new Set(xs) : null);
  const course = (xs: readonly Terrain[]) => (xs.length ? new Set(xs) : null);
  const all = tokenize(filters.q);
  return {
    tokens: all.filter((t) => !isYearToken(t)),
    years: all.filter(isYearToken),
    distances: set(filters.distances, DISTANCE_IDS),
    brands: set(filters.brands, BRAND_IDS),
    regions: set(filters.regions, REGION_IDS),
    bike: course(filters.bike),
    run: course(filters.run),
    range: resolveTimeRange(filters.time, today),
  };
}

/**
 * Races with a next edition to enter. Everything else (a race replaced by another, a
 * one-off that has been held, every edition cancelled) stays out of the results, the
 * counts and the map, but can still be opened from a link.
 */
export function isListed(race: Race): boolean {
  return race.nextEdition !== null;
}

function matches(race: Race, filters: Filters, p: Prepared, ctx: FilterContext, skip: ReadonlySet<Dimension>): boolean {
  if (!isListed(race)) return false;
  if (!skip.has('q') && p.tokens.length && !matchesTokens(race.searchText, p.tokens)) return false;
  if (!skip.has('q') && p.years.length && !editionInRange(race, null, ctx.today, filters.showEstimated, p.years)) {
    return false;
  }
  if (!skip.has('distance') && p.distances && !p.distances.has(race.distance)) return false;
  if (!skip.has('brand') && p.brands && !p.brands.has(race.brand)) return false;
  if (!skip.has('region') && p.regions && !p.regions.has(race.region)) return false;
  if (!skip.has('entry') && filters.openOnly && race.entry !== 'open') return false;
  if (!skip.has('soldout') && filters.hideSoldOut && isSoldOut(race, p, ctx.today, filters.showEstimated)) {
    return false;
  }
  if (!skip.has('bike') && p.bike && (race.bike === undefined || !p.bike.has(race.bike))) return false;
  if (!skip.has('run') && p.run && (race.run === undefined || !p.run.has(race.run))) return false;
  const next = race.nextEdition;
  if (!skip.has('estimated') && !filters.showEstimated && (!next || next.estimated)) return false;
  // Any upcoming edition in the range counts, so a search for late 2027 also finds a
  // race whose next edition is in late 2026.
  if (!skip.has('time') && p.range && !editionInRange(race, p.range, ctx.today, filters.showEstimated)) return false;
  if (!skip.has('shortlist') && filters.shortlistOnly && !ctx.shortlist.has(race.id)) return false;
  if (!skip.has('area') && filters.inMapArea && ctx.bounds && !inBounds(race.lng, race.lat, ctx.bounds)) return false;
  return true;
}

/**
 * Whether the edition a race is shown with is sold out or closed by its registration
 * status. The status is about the next edition only: a race shown with a later edition (a
 * 2027 search, when the 2026 edition is sold out) is not hidden.
 */
function isSoldOut(race: Race, p: Prepared, today: ISODate, withEstimated: boolean): boolean {
  if (!race.registration || !HIDDEN_BY_SOLD_OUT.has(race.registration.status)) return false;
  const shown =
    p.range || p.years.length ? editionInRange(race, p.range, today, withEstimated, p.years) : race.nextEdition;
  return shownRegistration(race, shown) !== undefined;
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

/**
 * The edition each race is shown with: the first one inside the time range and the
 * searched years, or simply the next edition when neither is set. Races that do not
 * match (or have no next edition) are left out of the map.
 */
export function shownEditions(races: readonly Race[], filters: Filters, today: ISODate): Map<string, NextEdition> {
  const range = resolveTimeRange(filters.time, today);
  const years = tokenize(filters.q).filter(isYearToken);
  const out = new Map<string, NextEdition>();
  for (const r of races) {
    const e = range || years.length ? editionInRange(r, range, today, filters.showEstimated, years) : r.nextEdition;
    if (e) out.set(r.id, e);
  }
  return out;
}

export interface FacetCounts {
  distance: Record<DistanceId, number>;
  brand: Record<BrandId, number>;
  region: Record<RegionId, number>;
  bike: Record<Terrain, number>;
  run: Record<Terrain, number>;
}

/** Counts per option, each computed with every filter applied except its own dimension. */
export function facetCounts(races: readonly Race[], filters: Filters, ctx: FilterContext): FacetCounts {
  const count = <K extends string>(dim: Dimension, keys: readonly K[], get: (r: Race) => K | undefined) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    for (const r of filterRaces(races, filters, ctx, [dim])) {
      const k = get(r);
      if (k !== undefined) out[k]++;
    }
    return out;
  };
  return {
    distance: count('distance', DISTANCE_IDS, (r) => r.distance),
    brand: count('brand', BRAND_IDS, (r) => r.brand),
    region: count('region', REGION_IDS, (r) => r.region),
    bike: count('bike', TERRAINS, (r) => r.bike),
    run: count('run', TERRAINS, (r) => r.run),
  };
}

/**
 * How many races an active bike/run filter hides only because the race has no course
 * profile in the data yet (they would match if the missing profile counted as a match).
 * 0 when no course filter is active.
 */
export function missingCourseCount(races: readonly Race[], filters: Filters, ctx: FilterContext): number {
  return missingCourseRaces(races, filters, ctx).length;
}

/** The races counted by missingCourseCount, so the UI can list them on request. */
export function missingCourseRaces(races: readonly Race[], filters: Filters, ctx: FilterContext): Race[] {
  const active = COURSE_DIMENSIONS.filter((d) => filters[d].length > 0);
  if (!active.length) return [];
  return filterRaces(races, filters, ctx, active).filter((r) => {
    let missing = false;
    for (const d of active) {
      const v = r[d];
      if (v === undefined) missing = true;
      else if (!filters[d].includes(v)) return false;
    }
    return missing;
  });
}

export interface MonthBucket {
  key: MonthKey;
  /** Races with a known (confirmed or tentative) date in this month. */
  count: number;
  /** Races with an estimated date in this month. */
  estimated: number;
  /** Ids behind `count` and `estimated`, to count a multi-month selection without duplicates. */
  ids: string[];
  estimatedIds: string[];
}

/**
 * Month histogram from the current month to the last month with an upcoming edition,
 * and at least to December of next year (`minMonths` long at the very least). The axis
 * comes from all races so it does not jump while filtering; the counts use every filter
 * except time. A race counts in every month it is held (e.g. Dec 2026 and Dec 2027).
 * Estimated editions are counted (separately) only while estimated dates are shown.
 */
export function monthHistogram(
  allRaces: readonly Race[],
  filters: Filters,
  ctx: FilterContext,
  minMonths = 12,
): MonthBucket[] {
  const start = monthKeyOf(ctx.today);
  let end = addMonths(start, minMonths - 1);
  const nextDecember = `${Number(ctx.today.slice(0, 4)) + 1}-12`;
  if (nextDecember > end) end = nextDecember;
  for (const r of allRaces) {
    const last = r.upcoming.at(-1);
    if (!last) continue;
    const m = editionMonth(last, ctx.today);
    if (m > end) end = m;
  }
  const buckets: MonthBucket[] = monthRange(start, end).map((key) => ({
    key,
    count: 0,
    estimated: 0,
    ids: [],
    estimatedIds: [],
  }));
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of filterRaces(allRaces, filters, ctx, ['time'])) {
    const seen = new Set<number>();
    for (const e of r.upcoming) {
      if (e.estimated && !filters.showEstimated) continue;
      const i = index.get(editionMonth(e, ctx.today));
      if (i === undefined || seen.has(i)) continue;
      seen.add(i);
      const b = buckets[i]!;
      if (e.estimated) {
        b.estimated++;
        b.estimatedIds.push(r.id);
      } else {
        b.count++;
        b.ids.push(r.id);
      }
    }
  }
  return buckets;
}

/** Distinct races in buckets[from..to] (estimated ones only when `withEstimated`). */
export function racesInBuckets(buckets: readonly MonthBucket[], from: number, to: number, withEstimated: boolean) {
  const ids = new Set<string>();
  for (const b of buckets.slice(from, to + 1)) {
    for (const id of b.ids) ids.add(id);
    if (withEstimated) for (const id of b.estimatedIds) ids.add(id);
  }
  return ids.size;
}

const byName = (a: Race, b: Race) => a.name.localeCompare(b.name, 'en') || a.distance.localeCompare(b.distance);

/**
 * Sort by date (ties by name), by name, or nearest first from `origin`. "near" without
 * an origin (no location and no map yet) falls back to date order. Dates come from
 * `shown` (see shownEditions) and default to each race's next edition.
 */
export function sortRaces(
  races: readonly Race[],
  sort: SortKey,
  origin: LngLat | null = null,
  shown?: ReadonlyMap<string, NextEdition>,
): Race[] {
  const dateOf = (r: Race) => (shown?.get(r.id) ?? r.nextEdition)?.date;
  const byDate = (a: Race, b: Race) => byDateThenName(a, b, dateOf);
  if (sort === 'near' && origin) return sortByDistance(races, origin, byDate);
  const out = [...races];
  if (sort === 'name') return out.sort(byName);
  return out.sort(byDate);
}

export interface RaceGroup {
  /** Month key, or 'tba' for races without any next date. */
  key: string;
  races: Race[];
}

/** Consecutive runs of races that share a month (input should be date-sorted). */
export function groupByMonth(
  races: readonly Race[],
  shown?: ReadonlyMap<string, NextEdition>,
  today?: ISODate,
): RaceGroup[] {
  const groups: RaceGroup[] = [];
  for (const r of races) {
    const e = shown?.get(r.id) ?? r.nextEdition;
    const key = e ? (today ? editionMonth(e, today) : monthKeyOf(e.date)) : 'tba';
    const last = groups.at(-1);
    if (last && last.key === key) last.races.push(r);
    else groups.push({ key, races: [r] });
  }
  return groups;
}

export function isDefaultFilters(f: Filters): boolean {
  return activeDimensions(f).length === 0;
}

/**
 * The filter dimensions set away from their default (sort excluded). All of them narrow
 * the results except 'estimated', which adds races whose date is only estimated.
 */
export function activeDimensions(f: Filters): Dimension[] {
  const out: Dimension[] = [];
  if (f.q.trim()) out.push('q');
  if (f.distances.length && f.distances.length < DISTANCE_IDS.length) out.push('distance');
  if (f.brands.length && f.brands.length < BRAND_IDS.length) out.push('brand');
  if (f.regions.length && f.regions.length < REGION_IDS.length) out.push('region');
  if (f.time.kind !== 'any') out.push('time');
  if (f.openOnly) out.push('entry');
  if (f.hideSoldOut) out.push('soldout');
  if (f.bike.length) out.push('bike');
  if (f.run.length) out.push('run');
  // Estimated dates are off by default; turning them on is the non-default setting.
  if (f.showEstimated) out.push('estimated');
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
    case 'entry':
      return { ...f, openOnly: false };
    case 'soldout':
      return { ...f, hideSoldOut: false };
    case 'bike':
      return { ...f, bike: [] };
    case 'run':
      return { ...f, run: [] };
    case 'estimated':
      return { ...f, showEstimated: false };
    case 'area':
      return { ...f, inMapArea: false };
    case 'shortlist':
      return { ...f, shortlistOnly: false };
  }
}

export function clearAll(f: Filters): Filters {
  return { ...DEFAULT_FILTERS, sort: f.sort };
}

/**
 * Races left out only because their date in the searched period (or their next date)
 * is not announced yet: they would match with estimated dates shown. 0 while estimated
 * dates are shown. Estimates only ever add races, so this is a plain difference.
 */
export function hiddenByEstimates(races: readonly Race[], filters: Filters, ctx: FilterContext): number {
  if (filters.showEstimated) return 0;
  return filterRaces(races, { ...filters, showEstimated: true }, ctx).length - filterRaces(races, filters, ctx).length;
}

/**
 * How many races "Hide sold out" hides, or would hide if it were turned on, given the
 * other filters.
 */
export function soldOutCount(races: readonly Race[], filters: Filters, ctx: FilterContext): number {
  return (
    filterRaces(races, filters, ctx, ['soldout']).length -
    filterRaces(races, { ...filters, hideSoldOut: true }, ctx).length
  );
}

/** Whether a time range or a year in the search limits the results to a period. */
export function searchesPeriod(filters: Filters): boolean {
  return filters.time.kind !== 'any' || tokenize(filters.q).some(isYearToken);
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

/** Toggle a value, keeping `all`'s order, without collapsing "all selected" to empty. */
export function toggleExact<T>(selected: readonly T[], value: T, all: readonly T[]): T[] {
  const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  return all.filter((v) => next.includes(v));
}
