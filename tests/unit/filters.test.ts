import { describe, expect, it } from 'vitest';
import {
  activeDimensions,
  clampTimeToToday,
  clearAll,
  DEFAULT_FILTERS,
  describeTime,
  clearDimension,
  facetCounts,
  filterRaces,
  groupByMonth,
  hiddenByEstimates,
  isListed,
  missingCourseCount,
  missingCourseRaces,
  monthHistogram,
  racesInBuckets,
  resolveTimeRange,
  searchesPeriod,
  shownEditions,
  sortRaces,
  suggestRelaxations,
  toggleExact,
  toggleValue,
  type FilterContext,
  type Filters,
} from '../../src/lib/filters.ts';
import { fixtureRaces, TODAY } from './helpers.ts';

const races = fixtureRaces();
const listed = races.filter(isListed);
const ctx: FilterContext = { today: TODAY, bounds: null, shortlist: new Set() };
const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over });
/** With estimated dates shown (they are off by default). */
const est = (over: Partial<Filters>): Filters => f({ showEstimated: true, ...over });
const ids = (list: { id: string }[]) => list.map((r) => r.id).sort();

describe('filterRaces', () => {
  it('returns every race with an announced next date by default', () => {
    expect(DEFAULT_FILTERS.showEstimated).toBe(false);
    const out = filterRaces(races, DEFAULT_FILTERS, ctx);
    expect(out).toHaveLength(16);
    // Challenge Roth's next date is only estimated: it needs "Estimated dates".
    expect(ids(out)).not.toContain('challenge-roth-full');
    expect(out.every((r) => r.nextEdition && !r.nextEdition.estimated)).toBe(true);
    expect(filterRaces(races, est({}), ctx)).toHaveLength(17);
  });

  it('matches the start of words and knows common country names', () => {
    // "usa" must not match inside a word (Lusail), "kona" not inside "Kikonai".
    expect(ids(filterRaces(races, f({ q: 'usa' }), ctx))).toEqual(['ironman-kailua-kona-full']);
    expect(ids(filterRaces(races, f({ q: 'us' }), ctx))).toEqual(['ironman-kailua-kona-full']);
    expect(ids(filterRaces(races, f({ q: 'uae' }), ctx))).toEqual(['t100-dubai-t100']);
    expect(ids(filterRaces(races, f({ q: 'holland' }), ctx))).toEqual([
      'challenge-almere-amsterdam-full',
      'challenge-almere-amsterdam-half',
    ]);
    expect(ids(filterRaces(races, f({ q: 'frank' }), ctx))).toEqual(['ironman-frankfurt-full']);
    expect(filterRaces(races, f({ q: 'ankfurt' }), ctx)).toHaveLength(0);
    expect(ids(filterRaces(races, f({ q: '703 vietnam' }), ctx))).toEqual(['ironman-da-nang-half']);
    expect(ids(filterRaces(races, f({ q: 'oceania' }), ctx))).toEqual(['t100-wanaka-t100']);
  });

  it('searches name, city, country and series, accent- and case-insensitively', () => {
    expect(ids(filterRaces(races, f({ q: 'FLORIANOPOLIS' }), ctx))).toEqual(['ironman-florianopolis-full']);
    expect(ids(filterRaces(races, f({ q: 'wanaka' }), ctx))).toEqual(['t100-wanaka-t100']); // city is "Wānaka"
    expect(ids(filterRaces(races, est({ q: 'germany' }), ctx))).toEqual([
      'challenge-roth-full',
      'ironman-frankfurt-full',
    ]);
    expect(ids(filterRaces(races, f({ q: 'almere half' }), ctx))).toEqual([]); // "half" is not in the text
    expect(ids(filterRaces(races, f({ q: '70.3 viet' }), ctx))).toEqual(['ironman-da-nang-half']);
    expect(filterRaces(races, f({ q: '   ' }), ctx)).toHaveLength(16);
  });

  it('finds a race by the name it had before it was continued as another race', () => {
    expect(ids(filterRaces(races, f({ q: 'challenge wanaka' }), ctx))).toEqual(['t100-wanaka-t100']);
  });

  it('never lists races without a next edition (replaced or one-off races), whatever the filters', () => {
    const hidden = ['challenge-wanaka-half', 'ironman-nice-world-championship-half'];
    expect(races).toHaveLength(19);
    expect(races.filter((r) => !isListed(r)).map((r) => r.id)).toEqual(expect.arrayContaining(hidden));
    for (const filters of [
      DEFAULT_FILTERS,
      f({ q: '70.3 world championship' }),
      f({ time: { kind: 'range', from: '2026-01', to: '2027-12' } }),
      f({ showEstimated: true }),
    ]) {
      const out = ids(filterRaces(races, filters, ctx));
      for (const id of hidden) expect(out).not.toContain(id);
    }
  });

  it('filters by distance, brand and region (multi-select, OR within a dimension)', () => {
    expect(filterRaces(races, f({ distances: ['t100'] }), ctx)).toHaveLength(3);
    expect(filterRaces(races, f({ distances: ['full', 'half'] }), ctx)).toHaveLength(13);
    expect(filterRaces(races, f({ brands: ['challenge', 'independent'] }), ctx)).toHaveLength(5);
    expect(ids(filterRaces(races, f({ regions: ['oceania', 'asia'] }), ctx))).toEqual([
      'ironman-da-nang-half',
      't100-wanaka-t100',
    ]);
    expect(ids(filterRaces(races, f({ regions: ['europe'], distances: ['half'] }), ctx))).toEqual([
      'challenge-almere-amsterdam-half',
      'ironman-cascais-half',
    ]);
  });

  it('filters by time, inclusive month range', () => {
    expect(ids(filterRaces(races, f({ time: { kind: 'range', from: '2026-10', to: '2026-10' } }), ctx))).toEqual([
      'ironman-cascais-half',
      'ironman-kailua-kona-full',
    ]);
    // Next 3 months = Sep–Dec 2026
    expect(filterRaces(races, f({ time: { kind: 'preset', preset: '3m' } }), ctx)).toHaveLength(5);
    expect(filterRaces(races, f({ time: { kind: 'preset', preset: 'year' } }), ctx)).toHaveLength(5);
    // Next 12 months = Sep 2026 – Sep 2027: everything but Bahrain (Dec 2027).
    const year = filterRaces(races, f({ time: { kind: 'preset', preset: '12m' } }), ctx);
    expect(year).toHaveLength(15);
    expect(ids(year)).not.toContain('ironman-bahrain-half');
  });

  it('matches any upcoming edition in the range, not only the next one', () => {
    // Kona's next edition is Oct 2026; its Oct 2027 edition (estimated) is in a 2027 search.
    const late2027 = est({ time: { kind: 'range', from: '2027-10', to: '2027-12' } });
    const out = filterRaces(races, late2027, ctx);
    expect(ids(out)).toEqual([
      'ironman-bahrain-half',
      'ironman-cascais-half',
      'ironman-cozumel-full',
      'ironman-kailua-kona-full',
      't100-dubai-t100',
    ]);
    // …and is shown with that edition, while the default view shows the next one.
    const shown = shownEditions(out, late2027, TODAY);
    expect(shown.get('ironman-kailua-kona-full')).toEqual({
      estimated: true,
      date: '2027-10-09',
      status: 'estimated',
      basedOn: '2026-10-10',
    });
    expect(shownEditions(out, DEFAULT_FILTERS, TODAY).get('ironman-kailua-kona-full')?.date).toBe('2026-10-10');
    // Every race has a 2027 edition (known or estimated).
    expect(filterRaces(races, est({ time: { kind: 'preset', preset: 'next-year' } }), ctx)).toHaveLength(17);
    // Sorting and month groups follow the shown edition.
    const sorted = sortRaces(out, 'date', null, shown);
    expect(sorted.map((r) => r.id)).toEqual([
      'ironman-kailua-kona-full',
      'ironman-cascais-half',
      't100-dubai-t100',
      'ironman-cozumel-full',
      'ironman-bahrain-half',
    ]);
    expect(groupByMonth(sorted, shown).map((g) => g.key)).toEqual(['2027-10', '2027-11', '2027-12']);
  });

  it('treats a year in the search as "has an edition that year"', () => {
    expect(ids(filterRaces(races, est({ q: 'kona 2027' }), ctx))).toEqual(['ironman-kailua-kona-full']);
    expect(ids(filterRaces(races, est({ q: 'roth 2027' }), ctx))).toEqual(['challenge-roth-full']);
    expect(filterRaces(races, est({ q: 'roth 2026' }), ctx)).toHaveLength(0);
    expect(filterRaces(races, est({ q: '2026' }), ctx)).toHaveLength(5);
    const shown = shownEditions(races, est({ q: 'kona 2027' }), TODAY);
    expect(shown.get('ironman-kailua-kona-full')?.date).toBe('2027-10-09');
  });

  it('only counts announced editions for a season-planning search while estimated dates are off', () => {
    // Kona 2027, Cascais 2027, Dubai 2027 and Cozumel 2027 are projections: only Bahrain
    // has an announced date in late 2027.
    const late2027 = f({ time: { kind: 'range', from: '2027-10', to: '2027-12' } });
    expect(ids(filterRaces(races, late2027, ctx))).toEqual(['ironman-bahrain-half']);
    expect(hiddenByEstimates(races, late2027, ctx)).toBe(4);
    // Next year: the eleven races with an announced 2027 date, not all seventeen.
    const nextYear = f({ time: { kind: 'preset', preset: 'next-year' } });
    expect(filterRaces(races, nextYear, ctx)).toHaveLength(11);
    expect(hiddenByEstimates(races, nextYear, ctx)).toBe(6);
    // A year in the search works the same way.
    expect(filterRaces(races, f({ q: 'kona 2027' }), ctx)).toHaveLength(0);
    expect(hiddenByEstimates(races, f({ q: 'kona 2027' }), ctx)).toBe(1);
    expect(shownEditions(races, f({ q: 'kona 2027' }), TODAY).has('ironman-kailua-kona-full')).toBe(false);
    // No estimated edition is ever shown: not in a range, not as a next edition.
    for (const filters of [DEFAULT_FILTERS, late2027, nextYear, f({ q: '2027' })]) {
      const shown = shownEditions(filterRaces(races, filters, ctx), filters, TODAY);
      expect([...shown.values()].some((e) => e.estimated)).toBe(false);
    }
  });

  it('shows races whose next date is only estimated once estimated dates are on', () => {
    const off = filterRaces(races, DEFAULT_FILTERS, ctx);
    expect(off.some((r) => r.id === 'challenge-roth-full')).toBe(false);
    const on = filterRaces(races, est({}), ctx);
    expect(on.some((r) => r.id === 'challenge-roth-full')).toBe(true);
    expect(hiddenByEstimates(races, DEFAULT_FILTERS, ctx)).toBe(1);
    expect(hiddenByEstimates(races, est({}), ctx)).toBe(0);
    // Other filters still apply: no estimated-only race in Asia.
    expect(hiddenByEstimates(races, f({ regions: ['asia'] }), ctx)).toBe(0);
  });

  it('knows when a search is limited to a period', () => {
    expect(searchesPeriod(DEFAULT_FILTERS)).toBe(false);
    expect(searchesPeriod(f({ q: 'roth' }))).toBe(false);
    expect(searchesPeriod(f({ q: 'roth 2027' }))).toBe(true);
    expect(searchesPeriod(f({ time: { kind: 'preset', preset: '6m' } }))).toBe(true);
  });

  it('restricts to the shortlist and the map viewport', () => {
    const shortlist = new Set(['challenge-roth-full', 'ironman-cozumel-full']);
    expect(ids(filterRaces(races, est({ shortlistOnly: true }), { ...ctx, shortlist }))).toEqual([...shortlist].sort());
    // A starred race whose date is not announced yet waits for "Estimated dates".
    expect(ids(filterRaces(races, f({ shortlistOnly: true }), { ...ctx, shortlist }))).toEqual([
      'ironman-cozumel-full',
    ]);
    const europe = [-12, 34, 32, 72] as const;
    expect(filterRaces(races, f({ inMapArea: true }), { ...ctx, bounds: europe })).toHaveLength(8);
    // No viewport yet → the area filter is a no-op.
    expect(filterRaces(races, f({ inMapArea: true }), ctx)).toHaveLength(16);
    // Viewport across the antimeridian: NZ + Hawaii
    const pacific = [160, -50, 210, 25] as const;
    expect(ids(filterRaces(races, f({ inMapArea: true }), { ...ctx, bounds: pacific }))).toEqual([
      'ironman-kailua-kona-full',
      't100-wanaka-t100',
    ]);
  });

  it('keeps only open-entry races when asked (no qualifier-only or ballot races)', () => {
    const out = filterRaces(races, f({ openOnly: true }), ctx);
    expect(out).toHaveLength(13);
    expect(out.every((r) => r.entry === 'open')).toBe(true);
    expect(ids(filterRaces(races, f({ openOnly: false }), ctx))).toEqual(
      expect.arrayContaining(['ironman-kailua-kona-full', 'independent-norseman-full']),
    );
  });

  it('filters by bike and run course profile and drops races without that course info', () => {
    expect(ids(filterRaces(races, f({ bike: ['flat'] }), ctx))).toEqual([
      'challenge-almere-amsterdam-full',
      'challenge-almere-amsterdam-half',
      'ironman-cozumel-full',
    ]);
    expect(ids(filterRaces(races, f({ bike: ['hilly', 'mountainous'] }), ctx))).toEqual([
      'independent-celtman-full',
      'independent-embrunman-full',
      'independent-norseman-full',
      'ironman-south-africa-full',
      't100-french-riviera-t100',
    ]);
    // Every profile selected is "has bike course info", not "anything".
    const known = filterRaces(races, f({ bike: ['flat', 'rolling', 'hilly', 'mountainous'] }), ctx);
    expect(known).toHaveLength(13);
    expect(ids(known)).not.toContain('t100-dubai-t100');
    // Bike and run combine with AND.
    expect(ids(filterRaces(races, f({ bike: ['rolling'], run: ['rolling'] }), ctx))).toEqual([
      'ironman-kailua-kona-full',
      't100-wanaka-t100',
    ]);
    expect(ids(filterRaces(races, f({ run: ['mountainous'] }), ctx))).toEqual([
      'independent-celtman-full',
      'independent-norseman-full',
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
    expect(resolveTimeRange({ kind: 'preset', preset: '12m' }, TODAY)).toEqual({ from: '2026-09', to: '2027-09' });
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
    expect(describeTime({ kind: 'preset', preset: '12m' }, TODAY)).toBe('Next 12 months');
    expect(describeTime({ kind: 'preset', preset: 'year' }, TODAY)).toBe('Rest of 2026');
    expect(describeTime({ kind: 'preset', preset: 'next-year' }, TODAY)).toBe('2027');
    expect(describeTime({ kind: 'range', from: '2026-11', to: '2026-11' }, TODAY)).toBe('Nov 2026');
    expect(describeTime({ kind: 'range', from: '2026-11', to: '2027-02' }, TODAY)).toBe('Nov 2026 – Feb 2027');
  });
});

describe('monthHistogram', () => {
  it('spans from the current month to the last month with data, at least to December next year', () => {
    const h = monthHistogram(races, est({}), ctx);
    expect(h[0]!.key).toBe('2026-09');
    expect(h.at(-1)!.key).toBe('2027-12'); // Bahrain 2027-12-04
    // 17 races; 5 of them are also counted a second time, in the month of their
    // (estimated) 2027 edition.
    expect(h.reduce((a, b) => a + b.count + b.estimated, 0)).toBe(22);
    expect(h.find((b) => b.key === '2027-07')).toMatchObject({ key: '2027-07', count: 1, estimated: 1 }); // Norseman + Roth (est.)
    expect(h.find((b) => b.key === '2027-10')).toMatchObject({
      count: 0,
      estimated: 2,
      estimatedIds: ['ironman-cascais-half', 'ironman-kailua-kona-full'],
    });
  });

  it('counts no estimated edition while estimated dates are off', () => {
    const h = monthHistogram(races, DEFAULT_FILTERS, ctx);
    // Same axis (it does not jump when the setting changes)…
    expect(h.map((b) => b.key)).toEqual(monthHistogram(races, est({}), ctx).map((b) => b.key));
    // …but only the 16 races with an announced date, once each.
    expect(h.every((b) => b.estimated === 0 && b.estimatedIds.length === 0)).toBe(true);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(16);
    expect(h.find((b) => b.key === '2027-07')).toMatchObject({ count: 1, estimated: 0 }); // Norseman, not Roth
  });

  it('counts with every filter except time', () => {
    const filters = { brands: ['ironman'], time: { kind: 'range', from: '2026-10', to: '2026-10' } } as const;
    const h = monthHistogram(races, est({ ...filters, brands: [...filters.brands] }), ctx);
    expect(h.reduce((a, b) => a + b.count + b.estimated, 0)).toBe(11);
    // Without estimates: the 8 IRONMAN races, each in the month of its announced date.
    const off = monthHistogram(races, f({ ...filters, brands: [...filters.brands] }), ctx);
    expect(off.reduce((a, b) => a + b.count + b.estimated, 0)).toBe(8);
  });

  it('counts a race once across a multi-month selection', () => {
    const h = monthHistogram(races, est({}), ctx);
    const all = racesInBuckets(h, 0, h.length - 1, true);
    expect(all).toBe(17);
    expect(racesInBuckets(h, 0, h.length - 1, false)).toBe(16); // Roth only has an estimate
  });

  it('reaches December of next year even without data', () => {
    const h = monthHistogram([], DEFAULT_FILTERS, ctx, 12);
    expect(h).toHaveLength(16);
    expect(h.at(-1)!.key).toBe('2027-12');
  });

  it('counts a multi-day race that is on now in the current month', () => {
    const running = {
      ...races.find((r) => r.id === 'ironman-cozumel-full')!,
      id: 'running',
      upcoming: [
        { estimated: false as const, date: '2026-08-31', endDate: '2026-09-26', status: 'confirmed' as const },
      ],
    };
    running.nextEdition = running.upcoming[0]!;
    const h = monthHistogram([running], DEFAULT_FILTERS, ctx);
    expect(h[0]).toMatchObject({ key: '2026-09', count: 1 });
    const threeMonths = f({ time: { kind: 'preset', preset: '3m' } });
    expect(filterRaces([running], threeMonths, ctx)).toHaveLength(1);
  });
});

describe('clampTimeToToday', () => {
  it('drops a range that has passed and trims the past months off one that has not', () => {
    expect(clampTimeToToday({ kind: 'range', from: '2026-06', to: '2026-08' }, TODAY)).toEqual({
      time: { kind: 'any' },
      expired: true,
    });
    expect(clampTimeToToday({ kind: 'range', from: '2026-06', to: '2026-12' }, TODAY)).toEqual({
      time: { kind: 'range', from: '2026-09', to: '2026-12' },
      expired: false,
    });
    const future = { kind: 'range', from: '2027-01', to: '2027-03' } as const;
    expect(clampTimeToToday(future, TODAY)).toEqual({ time: future, expired: false });
    expect(clampTimeToToday({ kind: 'preset', preset: '3m' }, TODAY).expired).toBe(false);
  });
});

describe('facetCounts', () => {
  it('counts each option ignoring its own dimension', () => {
    const c = facetCounts(races, f({ brands: ['ironman'], regions: ['europe'] }), ctx);
    // Challenge Roth's next date is not announced (estimated dates are off).
    expect(c.brand).toEqual({ ironman: 2, challenge: 2, t100: 1, independent: 3 });
    expect(facetCounts(races, est({ brands: ['ironman'], regions: ['europe'] }), ctx).brand.challenge).toBe(3);
    expect(c.region.europe).toBe(2);
    expect(c.region['latin-america']).toBe(2);
    expect(c.distance).toEqual({ full: 1, half: 1, t100: 0 });
  });

  it('counts course profiles (races without the profile are not counted)', () => {
    const c = facetCounts(races, DEFAULT_FILTERS, ctx);
    expect(c.bike).toEqual({ flat: 3, rolling: 5, hilly: 3, mountainous: 2 });
    expect(c.run).toEqual({ flat: 8, rolling: 2, hilly: 1, mountainous: 2 });
    // The bike counts ignore the bike filter but respect the run filter.
    const withRun = facetCounts(races, f({ bike: ['flat'], run: ['rolling'] }), ctx);
    expect(withRun.bike).toEqual({ flat: 0, rolling: 2, hilly: 0, mountainous: 0 });
    expect(withRun.run).toEqual({ flat: 3, rolling: 0, hilly: 0, mountainous: 0 });
  });
});

describe('missingCourseCount', () => {
  it('is 0 without a course filter', () => {
    expect(missingCourseCount(races, DEFAULT_FILTERS, ctx)).toBe(0);
  });

  it('counts races hidden only because the filtered profile is unknown', () => {
    // Dubai, Bahrain (no profiles) and Da Nang (run only) have no bike profile.
    expect(missingCourseCount(races, f({ bike: ['flat'] }), ctx)).toBe(3);
    // South Africa has a hilly bike but no run profile.
    expect(missingCourseCount(races, f({ run: ['rolling'] }), ctx)).toBe(3);
  });

  it('does not count races that a known profile rules out anyway', () => {
    // South Africa: bike is hilly (ruled out by "rolling"), run unknown → not "missing".
    expect(missingCourseCount(races, f({ bike: ['rolling'], run: ['flat'] }), ctx)).toBe(3);
    // With a hilly bike allowed it would match but for the unknown run → counted.
    expect(missingCourseCount(races, f({ bike: ['hilly'], run: ['flat'] }), ctx)).toBe(4);
  });

  it('respects the other filters', () => {
    expect(missingCourseCount(races, f({ bike: ['flat'], regions: ['europe'] }), ctx)).toBe(0);
    expect(missingCourseCount(races, f({ bike: ['flat'], regions: ['middle-east'] }), ctx)).toBe(2);
  });

  it('lists the hidden races so they can be shown on request', () => {
    expect(ids(missingCourseRaces(races, f({ bike: ['flat'] }), ctx))).toEqual([
      'ironman-bahrain-half',
      'ironman-da-nang-half',
      't100-dubai-t100',
    ]);
  });
});

describe('sorting and grouping', () => {
  it('sorts by next date with ties by name, or by name', () => {
    const byDate = sortRaces(listed, 'date');
    expect(byDate[0]!.id).toBe('t100-french-riviera-t100');
    expect(byDate.at(-1)!.id).toBe('ironman-bahrain-half');
    const almere = byDate.filter((r) => r.city === 'Almere').map((r) => r.distance);
    expect(almere).toEqual(['full', 'half']);
    expect(sortRaces(listed, 'name')[0]!.name).toBe('Celtman Extreme Scottish Triathlon');
    // Races without a next date (only reachable by link) sort last.
    expect(
      sortRaces(races, 'date')
        .slice(-2)
        .map((r) => r.nextEdition),
    ).toEqual([null, null]);
  });

  it('sorts nearest first from an origin, and by date until there is one', () => {
    const frankfurt = { lat: 50.11, lng: 8.68 };
    expect(
      sortRaces(listed, 'near', frankfurt)
        .slice(0, 5)
        .map((r) => r.id),
    ).toEqual([
      'ironman-frankfurt-full',
      'challenge-roth-full',
      'challenge-almere-amsterdam-full', // co-located with the half: ties go by date, then name
      'challenge-almere-amsterdam-half',
      'independent-embrunman-full',
    ]);
    const wellington = { lat: -41.29, lng: 174.78 };
    expect(sortRaces(listed, 'near', wellington)[0]!.id).toBe('t100-wanaka-t100');
    expect(sortRaces(listed, 'near', null).map((r) => r.id)).toEqual(sortRaces(listed, 'date').map((r) => r.id));
  });

  it('groups consecutive races by month', () => {
    const groups = groupByMonth(sortRaces(listed, 'date'));
    expect(groups[0]).toMatchObject({ key: '2026-09' });
    expect(groups.map((g) => g.key)).toEqual([...new Set(groups.map((g) => g.key))]);
    expect(groups.reduce((a, g) => a + g.races.length, 0)).toBe(17);
  });
});

describe('helpers', () => {
  it('lists active dimensions and clears them', () => {
    const filters = f({
      q: 'x',
      brands: ['t100'],
      showEstimated: true,
      time: { kind: 'preset', preset: '3m' },
      sort: 'name',
    });
    // Estimated dates are off by default: showing them is the setting that counts.
    expect(activeDimensions(filters)).toEqual(['q', 'brand', 'time', 'estimated']);
    expect(activeDimensions(f({ showEstimated: false }))).toEqual([]);
    expect(clearDimension(filters, 'estimated').showEstimated).toBe(false);
    expect(clearAll(filters)).toEqual({ ...DEFAULT_FILTERS, sort: 'name' });
    expect(activeDimensions(f({ distances: ['full', 'half', 't100'] }))).toEqual([]);

    const course = f({ openOnly: true, bike: ['flat', 'rolling', 'hilly', 'mountainous'], run: ['flat'] });
    expect(activeDimensions(course)).toEqual(['entry', 'bike', 'run']);
    expect(clearDimension(course, 'entry').openOnly).toBe(false);
    expect(clearDimension(course, 'bike').bike).toEqual([]);
    expect(clearDimension(course, 'run').run).toEqual([]);
    expect(clearAll({ ...course, sort: 'near' })).toEqual({ ...DEFAULT_FILTERS, sort: 'near' });
  });

  it('suggests dropping a course or entry filter from the empty state', () => {
    const filters = f({ openOnly: true, run: ['mountainous'] });
    expect(filterRaces(races, filters, ctx)).toHaveLength(0);
    expect(suggestRelaxations(races, filters, ctx)).toEqual([
      { dimension: 'run', count: 13 },
      { dimension: 'entry', count: 2 },
    ]);
  });

  it('never suggests hiding estimated dates (it only ever removes races)', () => {
    const filters = est({ q: 'roth', regions: ['asia'] });
    expect(filterRaces(races, filters, ctx)).toHaveLength(0);
    expect(suggestRelaxations(races, filters, ctx).map((r) => r.dimension)).toEqual(['q', 'region']);
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

  it('toggles course profiles without collapsing "all selected"', () => {
    const all = ['a', 'b', 'c'] as const;
    expect(toggleExact(['c'], 'a', all)).toEqual(['a', 'c']);
    expect(toggleExact(['a', 'c'], 'b', all)).toEqual(['a', 'b', 'c']);
    expect(toggleExact(['a', 'b', 'c'], 'b', all)).toEqual(['a', 'c']);
  });
});
