import { describe, expect, it } from 'vitest';
import { nonStandardLabel, raceWhen } from '../../src/map/markers.ts';
import { fixtureRaces } from './helpers.ts';

const races = fixtureRaces();
const race = (id: string) => races.find((r) => r.id === id)!;

describe('map marker text', () => {
  it('tags a near-standard race with its real km, and no other race', () => {
    expect(nonStandardLabel(race('independent-celtman-full'))).toBe('Non-standard distance: 3.4 / 202 / 41 km');
    expect(races.filter((r) => nonStandardLabel(r) !== null).map((r) => r.id)).toEqual(['independent-celtman-full']);
  });

  it('writes the shown edition', () => {
    expect(raceWhen(race('ironman-frankfurt-full').nextEdition)).toBe('Sun 27 Jun 2027');
    expect(raceWhen(race('ironman-florianopolis-full').nextEdition)).toBe('Sun 30 May 2027 (TBC)');
  });
});
