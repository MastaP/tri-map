import { describe, expect, it } from 'vitest';
import { summarize, validateRaceFiles } from '../../src/data/validate.ts';
import { fixtureFiles, makeRecord, TODAY } from './helpers.ts';

const file = (name: string, races: unknown) => ({ name, text: JSON.stringify(races) });

describe('validateRaceFiles', () => {
  it('passes the fixture data with only the expected estimated-date and course warnings', () => {
    const result = validateRaceFiles(fixtureFiles(), TODAY);
    expect(result.errorCount).toBe(0);
    expect(result.races).toHaveLength(22);
    // The replaced Challenge Wanaka and the one-off 70.3 World Championship have no next
    // date on purpose (continuedAs / recurring: false), so they raise no warning.
    expect(result.issues.filter((i) => /estimated/.test(i.message)).map((i) => i.id)).toEqual(['challenge-roth-full']);
    // Listed races without a bike or run profile are hidden by a course filter: flagged.
    expect(
      result.issues
        .filter((i) => /course profile/.test(i.message))
        .map((i) => `${i.id}: ${i.message.split(':')[0]}`)
        .sort(),
    ).toEqual([
      'ironman-bahrain-half: no bike or run course profile',
      'ironman-da-nang-half: no bike course profile',
      'ironman-south-africa-full: no run course profile',
      't100-dubai-t100: no bike or run course profile',
    ]);
    expect(result.issues).toHaveLength(5);
    expect(summarize(result.races).missingCourse).toBe(4);
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
      /ironman-testville-full: no edition on\/after 2026-09-25; next date is estimated as 2027-03-07/,
    );
    expect(text).toMatch(/ironman-testville-2-full: name should not contain a year/);
    expect(text).toMatch(/ironman-testville-2-full: possible duplicate of ironman-testville-full/);
  });

  it('accepts a near-standard course, warns about one within 5% and rejects one out of scope', () => {
    const r = validateRaceFiles(
      [
        file('ironman-full.json', [
          makeRecord({ course: { swim: 3.4, bike: 202, run: 41 } }),
          makeRecord({ id: 'ironman-b-full', lat: 50.3, course: { swim: 3.8, bike: 186, run: 42.2 } }),
          makeRecord({ id: 'ironman-c-full', lat: 50.5, course: { swim: 3.8, bike: 230, run: 42.2 } }),
        ]),
      ],
      TODAY,
    );
    const text = r.issues
      .filter((i) => /^course/.test(i.message))
      .map((i) => `${i.level} ${i.id}: ${i.message}`)
      .join('\n');
    // Celtman-like 3.4 / 202 / 41 km: fine, nothing to report.
    expect(text).not.toMatch(/ironman-testville-full/);
    expect(text).toMatch(
      /warning ironman-b-full: course \(3\.8 \/ 186 \/ 42\.2 km\) is within 5% of the standard on every leg: leave "course" out/,
    );
    expect(text).toMatch(/error ironman-c-full: course\.bike: 230 km is more than 25% off the full distance bike/);
    expect(r.races.map((x) => x.id)).toEqual(['ironman-testville-full', 'ironman-b-full']);
  });
});

describe('races other than long-distance triathlons', () => {
  const nl = (overrides: Parameters<typeof makeRecord>[0]) =>
    makeRecord({
      brand: 'independent',
      series: 'TriHard',
      country: 'NL',
      city: 'Almere',
      lat: 52.3508,
      lng: 5.2647,
      bike: 'flat',
      run: 'flat',
      ...overrides,
    });
  const du = (slug: string, run1: number, bike: number, run2: number, lat = 52.3508) =>
    nl({ id: `independent-${slug}-duathlon`, distance: 'duathlon', lat, course: { run1, bike, run2 } });

  it('knows the Dutch-series and duathlon files and what belongs in them', () => {
    const r = validateRaceFiles(
      [
        file('netherlands.json', [nl({ id: 'independent-almere-sprint', distance: 'sprint' })]),
        file('duathlon.json', [
          du('zofingen', 10, 150, 30),
          nl({ id: 'independent-almere-olympic', distance: 'olympic', lat: 52.5012 }),
        ]),
      ],
      TODAY,
    );
    expect(r.errorCount).toBe(0);
    expect(r.issues.map((i) => `${i.id ?? i.file}: ${i.message}`)).toEqual([
      'independent-almere-olympic: distance "olympic" does not belong in duathlon.json',
    ]);
    const abroad = validateRaceFiles(
      [
        file('netherlands.json', [
          nl({ id: 'independent-gent-sprint', distance: 'sprint', country: 'BE', lat: 51.0543, lng: 3.7174 }),
        ]),
      ],
      TODAY,
    );
    expect(abroad.issues.map((i) => i.message)).toEqual(['Belgium does not belong in netherlands.json']);
  });

  it('asks only for the course profiles of the legs a race has', () => {
    const r = validateRaceFiles(
      [
        file('netherlands.json', [
          nl({ id: 'independent-almere-time-trial', distance: 'time-trial', course: { bike: 42 }, run: undefined }),
          nl({
            id: 'independent-almere-28k-time-trial',
            distance: 'time-trial',
            course: { bike: 28 },
            lat: 52.4012,
            bike: undefined,
            run: undefined,
          }),
        ]),
      ],
      TODAY,
    );
    expect(r.issues.map((i) => `${i.id}: ${i.message.split(':')[0]}`)).toEqual([
      'independent-almere-28k-time-trial: no bike course profile',
    ]);
  });

  it('flags a possible duplicate only when the legs match too', () => {
    const r = validateRaceFiles(
      [
        file('netherlands.json', [
          du('rbr-almere-short', 5, 28, 5),
          du('rbr-almere-long', 10, 56, 10),
          du('almere', 5, 28, 5, 52.351),
        ]),
      ],
      TODAY,
    );
    expect(r.issues.map((i) => `${i.id}: ${i.message}`)).toEqual([
      'independent-almere-duathlon: possible duplicate of independent-rbr-almere-short-duathlon (netherlands.json): same distance within 2 km',
    ]);
  });
});

describe('summarize', () => {
  it('counts by brand, distance and region and races without a confirmed date', () => {
    const { races } = validateRaceFiles(fixtureFiles(), TODAY);
    const s = summarize(races);
    expect(s.total).toBe(22);
    expect(s.byBrandDistance.ironman).toEqual({
      full: 5,
      half: 4,
      t100: 0,
      olympic: 0,
      sprint: 0,
      duathlon: 0,
      'time-trial': 0,
    });
    expect(s.byBrandDistance.t100).toEqual({
      full: 0,
      half: 0,
      t100: 3,
      olympic: 0,
      sprint: 0,
      duathlon: 0,
      'time-trial': 0,
    });
    expect(s.byRegionDistance.europe.full).toBe(6);
    expect(s.byBrandRegion.challenge.oceania).toBe(1);
    expect(s).toMatchObject({
      estimated: 1,
      tentative: 3,
      noDate: 2,
      noUpcomingConfirmed: 6,
      latestVerifiedAt: '2026-09-21',
    });
  });
});
