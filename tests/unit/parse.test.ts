import { describe, expect, it } from 'vitest';
import { parseRaceFiles, RaceDataError } from '../../src/data/parse.ts';
import { fixtureRaces, makeRecord, TODAY } from './helpers.ts';

describe('parseRaceFiles', () => {
  const races = fixtureRaces();
  const byId = (id: string) => races.find((r) => r.id === id)!;

  it('loads every fixture race', () => {
    expect(races).toHaveLength(16);
    expect(new Set(races.map((r) => r.brand))).toEqual(new Set(['ironman', 'challenge', 't100', 'independent']));
    expect(new Set(races.map((r) => r.region)).size).toBe(7);
  });

  it('derives region, country name, flag and search text', () => {
    const r = byId('ironman-florianopolis-full');
    expect(r.region).toBe('latin-america');
    expect(r.countryName).toBe('Brazil');
    expect(r.flag).toBe('🇧🇷');
    expect(r.searchText).toContain('florianopolis');
    expect(r.searchText).toContain('brazil');
  });

  it('derives the next edition with today injected', () => {
    expect(byId('challenge-roth-full').nextEdition).toMatchObject({ estimated: true, date: '2027-07-04' });
    expect(byId('ironman-bahrain-half').nextEdition).toMatchObject({
      estimated: false,
      status: 'tentative',
      date: '2027-12-04',
    });
    expect(byId('t100-french-riviera-t100').nextEdition?.date).toBe('2026-09-27');
    expect(fixtureRaces('2026-09-28').find((r) => r.id === 't100-french-riviera-t100')?.nextEdition).toMatchObject({
      estimated: true,
      date: '2027-09-26',
    });
  });

  it('throws a RaceDataError listing every problem', () => {
    const files = {
      '/data/races/a.json': [makeRecord()],
      '/data/races/b.json': [makeRecord()],
      '/data/races/c.json': { not: 'an array' },
      '/data/races/d.json': [makeRecord({ id: 'ironman-other-full', country: 'ZZ' })],
    };
    let error: unknown;
    try {
      parseRaceFiles(files, TODAY);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RaceDataError);
    const problems = (error as RaceDataError).problems.join('\n');
    expect(problems).toMatch(/d\.json \[0\]\.country \(ironman-other-full\): .*known country/);
    expect(problems).toMatch(/b\.json: duplicate id "ironman-testville-full" \(also in a\.json\)/);
    expect(problems).toMatch(/c\.json: .*expected array/i);
  });

  it('returns an empty list for no files', () => {
    expect(parseRaceFiles({}, TODAY)).toEqual([]);
  });
});
