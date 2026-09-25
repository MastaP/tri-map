import { describe, expect, it } from 'vitest';
import { summarize, validateRaceFiles } from '../../src/data/validate.ts';
import { fixtureFiles, makeRecord, TODAY } from './helpers.ts';

const file = (name: string, races: unknown) => ({ name, text: JSON.stringify(races) });

describe('validateRaceFiles', () => {
  it('passes the fixture data with only the expected estimated-date warning', () => {
    const result = validateRaceFiles(fixtureFiles(), TODAY);
    expect(result.errorCount).toBe(0);
    expect(result.races).toHaveLength(16);
    expect(result.issues.map((i) => i.id)).toEqual(['challenge-roth-full']);
  });

  it('reports invalid JSON and non-array files', () => {
    const r = validateRaceFiles([{ name: 'ironman-full.json', text: '[{' }, file('t100.json', {})], TODAY);
    expect(r.errorCount).toBe(2);
    expect(r.issues[0]!.message).toMatch(/not valid JSON/);
    expect(r.issues[1]!.message).toMatch(/bare JSON array/);
  });

  it('finds duplicate ids across files', () => {
    const r = validateRaceFiles(
      [file('ironman-full.json', [makeRecord()]), file('independent.json', [makeRecord()])],
      TODAY,
    );
    expect(r.issues.find((i) => i.level === 'error')?.message).toMatch(
      /duplicate id \(also defined in independent.json\)/,
    );
  });

  it('rejects coordinates outside the country region (e.g. a flipped sign)', () => {
    const r = validateRaceFiles(
      [file('ironman-full.json', [makeRecord({ country: 'BR', lat: 27.4394, lng: 48.4916 })])],
      TODAY,
    );
    expect(r.errorCount).toBe(1);
    expect(r.issues[0]!.message).toMatch(/outside the Latin America bounding box for Brazil/);
  });

  it('keeps going after a schema error and reports it with the record id', () => {
    const r = validateRaceFiles(
      [
        file('ironman-full.json', [
          makeRecord({ url: 'http://x.com' }),
          makeRecord({ id: 'ironman-b-full', lat: 50.12 }),
        ]),
      ],
      TODAY,
    );
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([
      {
        level: 'error',
        file: 'ironman-full.json',
        id: 'ironman-testville-full',
        message: 'url: must be an absolute https:// URL',
      },
    ]);
    expect(r.races.map((x) => x.id)).toEqual(['ironman-b-full']);
    expect(r.issues.some((i) => i.level === 'warning' && /fewer than 3 decimals/.test(i.message))).toBe(true);
  });

  it('warns (without failing) about file scope, series, stale data and duplicates', () => {
    const r = validateRaceFiles(
      [
        file('ironman-703-europe.json', [
          makeRecord({
            id: 'ironman-sydney-half',
            distance: 'half',
            country: 'AU',
            lat: -33.8688,
            lng: 151.2093,
            series: 'IRONMAN',
          }),
        ]),
        file('ironman-full.json', [
          makeRecord({ verifiedAt: '2024-01-01', editions: [{ date: '2026-03-01', status: 'confirmed' }] }),
          makeRecord({ id: 'ironman-testville-2-full', name: 'IRONMAN Testville 2027' }),
        ]),
      ],
      TODAY,
    );
    expect(r.errorCount).toBe(0);
    const text = r.issues.map((i) => `${i.id}: ${i.message}`).join('\n');
    expect(text).toMatch(/ironman-sydney-half: Australia \(Oceania\) does not belong in ironman-703-europe.json/);
    expect(text).toMatch(/ironman-sydney-half: series should be "IRONMAN 70.3"/);
    expect(text).toMatch(/ironman-testville-full: verifiedAt 2024-01-01 is more than a year old/);
    expect(text).toMatch(
      /ironman-testville-full: no edition on\/after 2026-09-25; next date is estimated as 2027-02-28/,
    );
    expect(text).toMatch(/ironman-testville-2-full: name should not contain a year/);
    expect(text).toMatch(/ironman-testville-2-full: possible duplicate of ironman-testville-full/);
  });
});

describe('summarize', () => {
  it('counts by brand, distance and region and races without a confirmed date', () => {
    const { races } = validateRaceFiles(fixtureFiles(), TODAY);
    const s = summarize(races);
    expect(s.total).toBe(16);
    expect(s.byBrandDistance.ironman).toEqual({ full: 5, half: 3, t100: 0 });
    expect(s.byRegionDistance.europe.full).toBe(5);
    expect(s.byBrandRegion.challenge.oceania).toBe(1);
    expect(s).toMatchObject({
      estimated: 1,
      tentative: 3,
      noDate: 0,
      noUpcomingConfirmed: 4,
      latestVerifiedAt: '2026-09-21',
    });
  });
});
