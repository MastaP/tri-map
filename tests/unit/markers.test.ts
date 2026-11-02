import { describe, expect, it } from 'vitest';
import { courseLabel, raceWhen } from '../../src/map/markers.ts';
import { fixtureRaces } from './helpers.ts';

const races = fixtureRaces();
const race = (id: string) => races.find((r) => r.id === id)!;

describe('map marker text', () => {
  it('tags a near-standard race with its real km, and no other race', () => {
    expect(courseLabel(race('independent-celtman-full'))).toBe('Non-standard distance: 3.4 / 202 / 41 km');
    expect(races.filter((r) => courseLabel(r)?.startsWith('Non-standard')).map((r) => r.id)).toEqual([
      'independent-celtman-full',
    ]);
  });

  it('names a duathlon or time trial with its km: their names often do not say what they are', () => {
    const base = race('ironman-frankfurt-full');
    expect(courseLabel({ ...base, distance: 'duathlon', course: { run1: 10, bike: 56, run2: 10 } })).toBe(
      'Duathlon: 10 / 56 / 10 km',
    );
    expect(courseLabel({ ...base, distance: 'time-trial', course: { bike: 42 } })).toBe('Time trial: 42 km');
  });

  it('writes the shown edition', () => {
    expect(raceWhen(race('ironman-frankfurt-full').nextEdition)).toBe('Sun 27 Jun 2027');
    expect(raceWhen(race('ironman-florianopolis-full').nextEdition)).toBe('Sun 30 May 2027 (TBC)');
  });
});
