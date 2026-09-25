import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type Filters } from '../../src/lib/filters.ts';
import { parseUrlState, serializeUrlState } from '../../src/lib/urlState.ts';

describe('URL state', () => {
  it('serializes defaults to an empty string', () => {
    expect(serializeUrlState({ filters: DEFAULT_FILTERS, raceId: null })).toBe('');
    expect(parseUrlState('')).toEqual({ filters: DEFAULT_FILTERS, raceId: null, bounds: null, view: null });
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
      showEstimated: true,
      inMapArea: true,
      shortlistOnly: true,
      sort: 'near',
    };
    const bounds = [4.1, 51.9, 6.3, 52.8] as const;
    const qs = serializeUrlState({ filters, raceId: 'challenge-roth-full', bounds });
    expect(qs).toBe(
      'q=roth+%C3%BCber&dist=full,half&brand=challenge&region=europe,asia&from=2026-10&to=2027-03&open=1&bike=flat,rolling&run=hilly&est=1&area=1&bbox=4.1,51.9,6.3,52.8&star=1&sort=near&race=challenge-roth-full',
    );
    expect(parseUrlState(`?${qs}`)).toEqual({ filters, raceId: 'challenge-roth-full', bounds, view: null });
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

  it('shows estimated dates only with est=1; old est=0 links mean off, the default', () => {
    expect(DEFAULT_FILTERS.showEstimated).toBe(false);
    expect(parseUrlState('est=1').filters.showEstimated).toBe(true);
    expect(parseUrlState('est=0').filters.showEstimated).toBe(false);
    expect(parseUrlState('est=yes').filters.showEstimated).toBe(false);
    expect(serializeUrlState({ filters: { ...DEFAULT_FILTERS, showEstimated: true }, raceId: null })).toBe('est=1');
    // An old "announced dates only" link is simply the default now.
    expect(serializeUrlState({ ...parseUrlState('dist=full&est=0'), raceId: null })).toBe('dist=full');
  });

  it('keeps the map area only for an "in map area" search, as a box', () => {
    const bounds = [4.12345, 51.98765, 6.30001, 52.8] as const;
    const area = { ...DEFAULT_FILTERS, inMapArea: true };
    // Rounded outwards to 3 decimals: the box still holds everything it held.
    expect(serializeUrlState({ filters: area, raceId: null, bounds })).toBe('area=1&bbox=4.123,51.987,6.301,52.8');
    expect(serializeUrlState({ filters: DEFAULT_FILTERS, raceId: null, bounds })).toBe('');
    expect(parseUrlState('area=1&bbox=4.123,51.987,6.301,52.8').bounds).toEqual([4.123, 51.987, 6.301, 52.8]);
    expect(parseUrlState('bbox=4.123,51.987,6.301,52.8').bounds).toBeNull();
    // A map on a world copy (west -200) and a box across the antimeridian.
    expect(serializeUrlState({ filters: area, raceId: null, bounds: [-200, -50, -150, 25] })).toBe(
      'area=1&bbox=160,-50,210,25',
    );
    expect(parseUrlState('area=1&bbox=160,-50,210,25').bounds).toEqual([160, -50, 210, 25]);
    // Wider than the world: the whole world.
    expect(serializeUrlState({ filters: area, raceId: null, bounds: [-300, -60, 300, 80] })).toBe(
      'area=1&bbox=-180,-60,180,80',
    );
    for (const junk of ['1,2,3', '4,52,3,53', '4,53,5,52', '4,-95,5,52', '-190,1,5,2', '0,1,400,2', 'a,b,c,d']) {
      expect(parseUrlState(`area=1&bbox=${junk}`).bounds, junk).toBeNull();
    }
  });

  it('still reads the map centre and zoom of an older "in map area" link', () => {
    expect(parseUrlState('area=1&at=52.371,4.9,6')).toMatchObject({
      bounds: null,
      view: { lat: 52.371, lng: 4.9, zoom: 6 },
    });
    expect(parseUrlState('at=52.371,4.9,6').view).toBeNull();
    expect(parseUrlState('area=1&at=95,4.9,6').view).toBeNull();
    expect(parseUrlState('area=1&at=nope').view).toBeNull();
    // A box wins over a centre.
    expect(parseUrlState('area=1&at=52.371,4.9,6&bbox=4,51,6,53')).toMatchObject({
      bounds: [4, 51, 6, 53],
      view: null,
    });
  });

  it('parses the 12-month preset', () => {
    expect(parseUrlState('when=12m').filters.time).toEqual({ kind: 'preset', preset: '12m' });
  });
});
