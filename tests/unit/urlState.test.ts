import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type Filters } from '../../src/lib/filters.ts';
import { parseUrlState, serializeUrlState } from '../../src/lib/urlState.ts';

describe('URL state', () => {
  it('serializes defaults to an empty string', () => {
    expect(serializeUrlState({ filters: DEFAULT_FILTERS, raceId: null })).toBe('');
    expect(parseUrlState('')).toEqual({ filters: DEFAULT_FILTERS, raceId: null });
  });

  it('round-trips every field', () => {
    const filters: Filters = {
      q: 'roth über',
      distances: ['full', 'half'],
      brands: ['challenge'],
      regions: ['europe', 'asia'],
      time: { kind: 'range', from: '2026-10', to: '2027-03' },
      showEstimated: false,
      inMapArea: true,
      shortlistOnly: true,
      sort: 'name',
    };
    const qs = serializeUrlState({ filters, raceId: 'challenge-roth-full' });
    expect(qs).toBe(
      'q=roth+%C3%BCber&dist=full,half&brand=challenge&region=europe,asia&from=2026-10&to=2027-03&est=0&area=1&star=1&sort=name&race=challenge-roth-full',
    );
    expect(parseUrlState(`?${qs}`)).toEqual({ filters, raceId: 'challenge-roth-full' });
  });

  it('round-trips presets and single months', () => {
    const preset = { ...DEFAULT_FILTERS, time: { kind: 'preset', preset: '6m' } } as Filters;
    expect(serializeUrlState({ filters: preset, raceId: null })).toBe('when=6m');
    expect(parseUrlState('when=6m').filters.time).toEqual({ kind: 'preset', preset: '6m' });
    const single = { ...DEFAULT_FILTERS, time: { kind: 'range', from: '2026-11', to: '2026-11' } } as Filters;
    expect(serializeUrlState({ filters: single, raceId: null })).toBe('from=2026-11');
    expect(parseUrlState('from=2026-11').filters.time).toEqual(single.time);
  });

  it('ignores junk and normalizes order', () => {
    const { filters, raceId } = parseUrlState(
      'dist=half,marathon,FULL&brand=xterra&region=mars,oceania&when=forever&from=2026-13&race=<script>',
    );
    expect(filters.distances).toEqual(['full', 'half']);
    expect(filters.brands).toEqual([]);
    expect(filters.regions).toEqual(['oceania']);
    expect(filters.time).toEqual({ kind: 'any' });
    expect(raceId).toBeNull();
  });

  it('treats "all selected" as no filter and swaps reversed ranges', () => {
    expect(parseUrlState('dist=full,half,t100').filters.distances).toEqual([]);
    expect(parseUrlState('from=2027-03&to=2026-10').filters.time).toEqual({
      kind: 'range',
      from: '2026-10',
      to: '2027-03',
    });
  });
});
