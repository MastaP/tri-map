import { describe, expect, it } from 'vitest';
import { attachRegistration, type RegistrationData } from '../../src/data/registration.ts';
import {
  activeDimensions,
  clearDimension,
  DEFAULT_FILTERS,
  filterRaces,
  soldOutCount,
  suggestRelaxations,
  type FilterContext,
  type Filters,
} from '../../src/lib/filters.ts';
import { fixtureRaces, fixtureRegistrationFiles, TODAY, inTimeZone } from './helpers.ts';

inTimeZone('UTC');

const data: RegistrationData = Object.fromEntries(
  fixtureRegistrationFiles()
    .filter((f) => f.name === 'ironman.json' || f.name === 't100.json')
    .map((f) => [f.name.replace('.json', ''), JSON.parse(f.text)]),
);
const races = attachRegistration(fixtureRaces(), data, TODAY);
const ctx: FilterContext = { today: TODAY, bounds: null, shortlist: new Set() };
const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over });
const ids = (list: { id: string }[]) => list.map((r) => r.id).sort();

describe('Hide sold out', () => {
  it('is off by default', () => {
    expect(DEFAULT_FILTERS.hideSoldOut).toBe(false);
    expect(filterRaces(races, DEFAULT_FILTERS, ctx).map((r) => r.id)).toContain('ironman-cozumel-full');
  });

  it('hides sold-out and closed races, keeps general-entry sold out, opening soon, open and unknown', () => {
    const all = ids(filterRaces(races, f({ showEstimated: true }), ctx));
    const shown = ids(filterRaces(races, f({ showEstimated: true, hideSoldOut: true }), ctx));
    expect(all.filter((id) => !shown.includes(id))).toEqual(['ironman-cascais-half', 'ironman-cozumel-full']);
    // General entry sold out: charity or travel-package places may remain.
    expect(shown).toContain('ironman-bahrain-half');
    expect(shown).toContain('ironman-south-africa-full');
    expect(shown).toContain('ironman-frankfurt-full');
    // Da Nang's sold-out status is about its past edition, the T100 one is stale: kept.
    expect(shown).toContain('ironman-da-nang-half');
    expect(shown).toContain('t100-dubai-t100');
  });

  it('hides a waitlist too (it is sold out)', () => {
    const waitlisted = races.map((r) =>
      r.id === 'ironman-frankfurt-full'
        ? { ...r, registration: { ...r.registration!, status: 'waitlist' as const } }
        : r,
    );
    expect(ids(filterRaces(waitlisted, f({ hideSoldOut: true }), ctx))).not.toContain('ironman-frankfurt-full');
  });

  it('keeps a race shown with a later edition than the sold-out one (planning next season)', () => {
    // Cozumel's 2026 edition is sold out; a race also held in 2027 stays in a 2027 search.
    const cozumel = races.find((r) => r.id === 'ironman-cozumel-full')!;
    const later = {
      ...cozumel,
      upcoming: [...cozumel.upcoming, { estimated: false as const, date: '2027-11-21', status: 'confirmed' as const }],
    };
    const list = [later];
    const range: Filters['time'] = { kind: 'range', from: '2027-01', to: '2027-12' };
    expect(filterRaces(list, f({ hideSoldOut: true, time: range }), ctx)).toHaveLength(1);
    expect(
      filterRaces(list, f({ hideSoldOut: true, time: { kind: 'range', from: '2026-11', to: '2027-12' } }), ctx),
    ).toHaveLength(0);
    expect(filterRaces(list, f({ hideSoldOut: true, q: '2027' }), ctx)).toHaveLength(1);
  });

  it('counts the races it hides (or would hide) with the other filters applied', () => {
    expect(soldOutCount(races, DEFAULT_FILTERS, ctx)).toBe(2);
    expect(soldOutCount(races, f({ hideSoldOut: true }), ctx)).toBe(2);
    expect(soldOutCount(races, f({ distances: ['full'] }), ctx)).toBe(1);
    expect(soldOutCount(races, f({ q: 'roth' }), ctx)).toBe(0);
  });

  it('is an active, clearable dimension and can be suggested from the empty state', () => {
    const on = f({ hideSoldOut: true, q: 'cozumel' });
    expect(activeDimensions(on)).toEqual(['q', 'soldout']);
    expect(clearDimension(on, 'soldout').hideSoldOut).toBe(false);
    expect(filterRaces(races, on, ctx)).toHaveLength(0);
    expect(suggestRelaxations(races, on, ctx).map((r) => r.dimension)).toContain('soldout');
  });
});
