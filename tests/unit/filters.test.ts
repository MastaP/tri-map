import { describe, expect, it } from 'vitest';
import {
  activeDimensions,
  clearAll,
  DEFAULT_FILTERS,
  describeTime,
  facetCounts,
  filterRaces,
  groupByMonth,
  monthHistogram,
  resolveTimeRange,
  sortRaces,
  suggestRelaxations,
  toggleValue,
  type FilterContext,
  type Filters,
} from '../../src/lib/filters.ts';
import { fixtureRaces, TODAY } from './helpers.ts';

const races = fixtureRaces();
const ctx: FilterContext = { today: TODAY, bounds: null, shortlist: new Set() };
const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over });
const ids = (list: { id: string }[]) => list.map((r) => r.id).sort();

describe('filterRaces', () => {
  it('returns everything with default filters', () => {
    expect(filterRaces(races, DEFAULT_FILTERS, ctx)).toHaveLength(16);
  });

  it('searches name, city, country and series, accent- and case-insensitively', () => {
    expect(ids(filterRaces(races, f({ q: 'FLORIANOPOLIS' }), ctx))).toEqual(['ironman-florianopolis-full']);
    expect(ids(filterRaces(races, f({ q: 'wanaka' }), ctx))).toEqual(['challenge-wanaka-half']); // city is "Wānaka"
    expect(ids(filterRaces(races, f({ q: 'germany' }), ctx))).toEqual([
      'challenge-roth-full',
      'ironman-frankfurt-full',
    ]);
    expect(ids(filterRaces(races, f({ q: 'almere half' }), ctx))).toEqual([]); // "half" is not in the text
    expect(ids(filterRaces(races, f({ q: '70.3 viet' }), ctx))).toEqual(['ironman-da-nang-half']);
    expect(filterRaces(races, f({ q: '   ' }), ctx)).toHaveLength(16);
  });

  it('filters by distance, brand and region (multi-select, OR within a dimension)', () => {
    expect(filterRaces(races, f({ distances: ['t100'] }), ctx)).toHaveLength(2);
    expect(filterRaces(races, f({ distances: ['full', 'half'] }), ctx)).toHaveLength(14);
    expect(filterRaces(races, f({ brands: ['challenge', 'independent'] }), ctx)).toHaveLength(6);
    expect(ids(filterRaces(races, f({ regions: ['oceania', 'asia'] }), ctx))).toEqual([
      'challenge-wanaka-half',
      'ironman-da-nang-half',
    ]);
    expect(ids(filterRaces(races, f({ regions: ['europe'], distances: ['half'] }), ctx))).toEqual([
      'challenge-almere-amsterdam-half',
      'ironman-cascais-half',
    ]);
  });

  it('filters by time using the next edition date, inclusive month range', () => {
    expect(ids(filterRaces(races, f({ time: { kind: 'range', from: '2026-10', to: '2026-10' } }), ctx))).toEqual([
      'ironman-cascais-half',
      'ironman-kailua-kona-full',
    ]);
    // Next 3 months = Sep–Dec 2026
    expect(filterRaces(races, f({ time: { kind: 'preset', preset: '3m' } }), ctx)).toHaveLength(5);
    expect(filterRaces(races, f({ time: { kind: 'preset', preset: 'year' } }), ctx)).toHaveLength(5);
    expect(filterRaces(races, f({ time: { kind: 'preset', preset: 'next-year' } }), ctx)).toHaveLength(11);
  });

  it('hides estimated dates when the toggle is off', () => {
    const out = filterRaces(races, f({ showEstimated: false }), ctx);
    expect(out).toHaveLength(15);
    expect(out.some((r) => r.id === 'challenge-roth-full')).toBe(false);
  });

  it('restricts to the shortlist and the map viewport', () => {
    const shortlist = new Set(['challenge-roth-full', 'ironman-cozumel-full']);
    expect(ids(filterRaces(races, f({ shortlistOnly: true }), { ...ctx, shortlist }))).toEqual([...shortlist].sort());
    const europe = [-12, 34, 32, 72] as const;
    expect(filterRaces(races, f({ inMapArea: true }), { ...ctx, bounds: europe })).toHaveLength(8);
    // No viewport yet → the area filter is a no-op.
    expect(filterRaces(races, f({ inMapArea: true }), ctx)).toHaveLength(16);
    // Viewport across the antimeridian: NZ + Hawaii
    const pacific = [160, -50, 210, 25] as const;
    expect(ids(filterRaces(races, f({ inMapArea: true }), { ...ctx, bounds: pacific }))).toEqual([
      'challenge-wanaka-half',
      'ironman-kailua-kona-full',
    ]);
  });

  it('can skip dimensions', () => {
    expect(
      filterRaces(races, f({ regions: ['asia'], inMapArea: true }), { ...ctx, bounds: [0, 0, 1, 1] }, ['area']),
    ).toHaveLength(1);
  });
});

describe('resolveTimeRange / describeTime', () => {
  it('resolves presets relative to today', () => {
    expect(resolveTimeRange({ kind: 'preset', preset: '3m' }, TODAY)).toEqual({ from: '2026-09', to: '2026-12' });
    expect(resolveTimeRange({ kind: 'preset', preset: '6m' }, TODAY)).toEqual({ from: '2026-09', to: '2027-03' });
    expect(resolveTimeRange({ kind: 'preset', preset: 'year' }, TODAY)).toEqual({ from: '2026-09', to: '2026-12' });
    expect(resolveTimeRange({ kind: 'preset', preset: 'next-year' }, TODAY)).toEqual({
      from: '2027-01',
      to: '2027-12',
    });
    expect(resolveTimeRange({ kind: 'any' }, TODAY)).toBeNull();
    expect(resolveTimeRange({ kind: 'range', from: '2027-03', to: '2026-11' }, TODAY)).toEqual({
      from: '2026-11',
      to: '2027-03',
    });
  });

  it('describes the selection', () => {
    expect(describeTime({ kind: 'any' }, TODAY)).toBe('Any time');
    expect(describeTime({ kind: 'preset', preset: '6m' }, TODAY)).toBe('Next 6 months');
    expect(describeTime({ kind: 'range', from: '2026-11', to: '2026-11' }, TODAY)).toBe('Nov 2026');
    expect(describeTime({ kind: 'range', from: '2026-11', to: '2027-02' }, TODAY)).toBe('Nov 2026 – Feb 2027');
  });
});

describe('monthHistogram', () => {
  it('spans from the current month to the last month with data', () => {
    const h = monthHistogram(races, DEFAULT_FILTERS, ctx);
    expect(h[0]!.key).toBe('2026-09');
    expect(h.at(-1)!.key).toBe('2027-12'); // Bahrain 2027-12-04
    expect(h.reduce((a, b) => a + b.count + b.estimated, 0)).toBe(16);
    expect(h.find((b) => b.key === '2027-07')).toEqual({ key: '2027-07', count: 1, estimated: 1 }); // Norseman + Roth (est.)
  });

  it('counts with every filter except time', () => {
    const h = monthHistogram(
      races,
      f({ brands: ['ironman'], time: { kind: 'range', from: '2026-10', to: '2026-10' } }),
      ctx,
    );
    expect(h.reduce((a, b) => a + b.count + b.estimated, 0)).toBe(8);
  });

  it('has a minimum length', () => {
    expect(monthHistogram([], DEFAULT_FILTERS, ctx, 12)).toHaveLength(12);
  });
});

describe('facetCounts', () => {
  it('counts each option ignoring its own dimension', () => {
    const c = facetCounts(races, f({ brands: ['ironman'], regions: ['europe'] }), ctx);
    expect(c.brand).toEqual({ ironman: 2, challenge: 3, t100: 1, independent: 2 });
    expect(c.region.europe).toBe(2);
    expect(c.region['latin-america']).toBe(2);
    expect(c.distance).toEqual({ full: 1, half: 1, t100: 0 });
  });
});

describe('sorting and grouping', () => {
  it('sorts by next date with ties by name, or by name', () => {
    const byDate = sortRaces(races, 'date');
    expect(byDate[0]!.id).toBe('t100-french-riviera-t100');
    expect(byDate.at(-1)!.id).toBe('ironman-bahrain-half');
    const almere = byDate.filter((r) => r.city === 'Almere').map((r) => r.distance);
    expect(almere).toEqual(['full', 'half']);
    expect(sortRaces(races, 'name')[0]!.name).toBe('Challenge Almere-Amsterdam');
  });

  it('groups consecutive races by month', () => {
    const groups = groupByMonth(sortRaces(races, 'date'));
    expect(groups[0]).toMatchObject({ key: '2026-09' });
    expect(groups.map((g) => g.key)).toEqual([...new Set(groups.map((g) => g.key))]);
    expect(groups.reduce((a, g) => a + g.races.length, 0)).toBe(16);
  });
});

describe('helpers', () => {
  it('lists active dimensions and clears them', () => {
    const filters = f({
      q: 'x',
      brands: ['t100'],
      showEstimated: false,
      time: { kind: 'preset', preset: '3m' },
      sort: 'name',
    });
    expect(activeDimensions(filters)).toEqual(['q', 'brand', 'time', 'estimated']);
    expect(clearAll(filters)).toEqual({ ...DEFAULT_FILTERS, sort: 'name' });
    expect(activeDimensions(f({ distances: ['full', 'half', 't100'] }))).toEqual([]);
  });

  it('suggests which filter to relax, best first', () => {
    const filters = f({ regions: ['oceania'], distances: ['full'] });
    expect(filterRaces(races, filters, ctx)).toHaveLength(0);
    expect(suggestRelaxations(races, filters, ctx)).toEqual([
      { dimension: 'region', count: 9 },
      { dimension: 'distance', count: 1 },
    ]);
  });

  it('toggles multi-select values; selecting all collapses to empty', () => {
    const all = ['a', 'b', 'c'] as const;
    expect(toggleValue([], 'b', all)).toEqual(['b']);
    expect(toggleValue(['c'], 'a', all)).toEqual(['a', 'c']);
    expect(toggleValue(['a', 'c'], 'b', all)).toEqual([]);
    expect(toggleValue(['a'], 'a', all)).toEqual([]);
  });
});
