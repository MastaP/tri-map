import { describe, expect, it } from 'vitest';
import { deriveRace, linkSuccessors, parseRaceFiles, RaceDataError } from '../../src/data/parse.ts';
import { fixtureRaces, makeRecord, TODAY } from './helpers.ts';

describe('parseRaceFiles', () => {
  const races = fixtureRaces();
  const byId = (id: string) => races.find((r) => r.id === id)!;

  it('loads every fixture race', () => {
    expect(races).toHaveLength(19);
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

  it('defaults entry to open', () => {
    expect(byId('challenge-roth-full').entry).toBe('open');
    expect(byId('ironman-frankfurt-full').entry).toBe('open');
    expect(byId('ironman-kailua-kona-full').entry).toBe('qualification');
    expect(byId('independent-norseman-full').entry).toBe('ballot');
  });

  it('has no next edition for replaced and one-off races once their editions are past', () => {
    expect(byId('challenge-wanaka-half').nextEdition).toBeNull(); // continuedAs
    expect(byId('ironman-nice-world-championship-half').nextEdition).toBeNull(); // recurring: false
    // Before the last edition it is still upcoming.
    expect(
      fixtureRaces('2026-09-01').find((r) => r.id === 'ironman-nice-world-championship-half')?.nextEdition,
    ).toMatchObject({ estimated: false, date: '2026-09-13' });
  });

  it('links successors to their predecessors and makes former names searchable', () => {
    const t100 = byId('t100-wanaka-t100');
    expect(t100.series).toBe('T100 Challenger');
    expect(t100.formerly).toEqual(['challenge-wanaka-half']);
    expect(t100.searchText).toContain('challenge wanaka');
    expect(byId('challenge-wanaka-half').continuedAs).toBe('t100-wanaka-t100');
    expect(byId('challenge-wanaka-half').formerly).toEqual([]);
  });

  it('collects several predecessors and ignores unknown targets', () => {
    const derived = [
      makeRecord({ id: 'ironman-a-full', name: 'Old A', continuedAs: 'ironman-new-full' }),
      makeRecord({ id: 'ironman-b-full', name: 'Old B', continuedAs: 'ironman-new-full' }),
      makeRecord({ id: 'ironman-c-full', name: 'Old C', continuedAs: 'ironman-gone-full' }),
      makeRecord({ id: 'ironman-new-full', name: 'New' }),
    ].map((r) => deriveRace(r, TODAY));
    const linked = linkSuccessors(derived);
    expect(linked.find((r) => r.id === 'ironman-new-full')?.formerly).toEqual(['ironman-a-full', 'ironman-b-full']);
    expect(linked.find((r) => r.id === 'ironman-new-full')?.searchText).toMatch(/old a old b$/);
    expect(linked.filter((r) => r.formerly.length)).toHaveLength(1);
    expect(derived[3]!.formerly).toEqual([]); // input not mutated
  });

  it('rejects a continuedAs that points at no race', () => {
    expect(() =>
      parseRaceFiles({ '/data/races/a.json': [makeRecord({ continuedAs: 'ironman-nowhere-full' })] }, TODAY),
    ).toThrow(/continuedAs "ironman-nowhere-full", which does not exist/);
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
