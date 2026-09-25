import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type Filters } from '../../src/lib/filters.ts';
import { parseUrlState, serializeUrlState } from '../../src/lib/urlState.ts';

describe('URL state', () => {
  it('serializes defaults to an empty string', () => {
    expect(serializeUrlState({ filters: DEFAULT_FILTERS, raceId: null })).toBe('');
    expect(parseUrlState('')).toEqual({ filters: DEFAULT_FILTERS, raceId: null, view: null });
  });

  it('round-trips every field', () => {
    const filters: Filters = {
      q: 'roth über',
      distances: ['full', 'half'],
      brands: ['challenge'],
      regions: ['europe', 'asia'],
      time: { kind: 'range', from: '2026-10', to: '2027-03' },
      openOnly: true,
      bike: ['flat', 'rolling'],
      run: ['hilly'],
      showEstimated: false,
      inMapArea: true,
      shortlistOnly: true,
      sort: 'near',
    };
    const view = { lat: 48.137, lng: 11.575, zoom: 6.5 };
    const qs = serializeUrlState({ filters, raceId: 'challenge-roth-full', view });
    expect(qs).toBe(
      'q=roth+%C3%BCber&dist=full,half&brand=challenge&region=europe,asia&from=2026-10&to=2027-03&open=1&bike=flat,rolling&run=hilly&est=0&area=1&at=48.137,11.575,6.5&star=1&sort=near&race=challenge-roth-full',
    );
    expect(parseUrlState(`?${qs}`)).toEqual({ filters, raceId: 'challenge-roth-full', view });
    expect(parseUrlState('sort=name').filters.sort).toBe('name');
  });

  it('keeps every course profile selected (it means "has course info") and orders them', () => {
    expect(parseUrlState('bike=mountainous,flat,hilly,rolling').filters.bike).toEqual([
      'flat',
      'rolling',
      'hilly',
      'mountainous',
    ]);
    expect(parseUrlState('run=steep,FLAT').filters.run).toEqual(['flat']);
    expect(parseUrlState('open=yes&sort=closest').filters).toMatchObject({ openOnly: false, sort: 'date' });
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

  it('keeps the map view only for an "in map area" search', () => {
    const view = { lat: 52.3714, lng: 4.8999, zoom: 6.04 };
    const area = { ...DEFAULT_FILTERS, inMapArea: true };
    expect(serializeUrlState({ filters: area, raceId: null, view })).toBe('area=1&at=52.371,4.9,6');
    expect(serializeUrlState({ filters: DEFAULT_FILTERS, raceId: null, view })).toBe('');
    expect(parseUrlState('area=1&at=52.371,4.9,6').view).toEqual({ lat: 52.371, lng: 4.9, zoom: 6 });
    expect(parseUrlState('at=52.371,4.9,6').view).toBeNull();
    expect(parseUrlState('area=1&at=95,4.9,6').view).toBeNull();
    expect(parseUrlState('area=1&at=nope').view).toBeNull();
  });

  it('parses the 12-month preset', () => {
    expect(parseUrlState('when=12m').filters.time).toEqual({ kind: 'preset', preset: '12m' });
  });
});
