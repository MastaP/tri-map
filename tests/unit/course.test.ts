import { describe, expect, it } from 'vitest';
import {
  isNearStandard,
  legDeviations,
  legsLong,
  legsText,
  nonStandardTitle,
  raceLegs,
} from '../../src/data/course.ts';
import { fixtureRaces } from './helpers.ts';

const full = (course?: { swim: number; bike: number; run: number }) => ({ distance: 'full' as const, course });

describe('near-standard courses', () => {
  it('is only near-standard with a course that has a leg more than 5% off the standard', () => {
    expect(isNearStandard(full())).toBe(false);
    expect(isNearStandard(full({ swim: 3.8, bike: 180, run: 42.2 }))).toBe(false);
    // Celtman: 3.4 km swim (10.5% short) and 202 km bike (12.2% long).
    expect(isNearStandard(full({ swim: 3.4, bike: 202, run: 41 }))).toBe(true);
    // Embrunman: 188 km bike is 4.4% long: ordinary course variation.
    expect(isNearStandard(full({ swim: 3.8, bike: 188, run: 42.2 }))).toBe(false);
    // Exactly 5% is not more than 5%, whatever the floating point says.
    expect(isNearStandard(full({ swim: 3.99, bike: 171, run: 42.2 }))).toBe(false);
    expect(isNearStandard(full({ swim: 3.8, bike: 180, run: 44.4 }))).toBe(true);
    expect(isNearStandard({ distance: 'half', course: { swim: 1.9, bike: 95, run: 21.1 } })).toBe(true);
    expect(isNearStandard({ distance: 't100', course: { swim: 2, bike: 80, run: 18 } })).toBe(false);
  });

  it('measures each leg against its own category', () => {
    const dev = legDeviations({ distance: 'half', course: { swim: 2, bike: 90, run: 19 } });
    expect(dev.swim).toBeCloseTo(0.0526, 3);
    expect(dev.bike).toBe(0);
    expect(dev.run).toBeCloseTo(0.0995, 3);
  });

  it('gives the official km, else the standard ones', () => {
    expect(raceLegs(full())).toEqual({ swim: 3.8, bike: 180, run: 42.2, total: 226 });
    expect(raceLegs(full({ swim: 3.4, bike: 202, run: 41 }))).toEqual({ swim: 3.4, bike: 202, run: 41, total: 246.4 });
    expect(raceLegs({ distance: 't100' })).toEqual({ swim: 2, bike: 80, run: 18, total: 100 });
  });

  it('writes the km for tags, tooltips and previews', () => {
    const celtman = full({ swim: 3.4, bike: 202, run: 41 });
    expect(legsText(raceLegs(celtman))).toBe('3.4 / 202 / 41 km');
    expect(legsLong(raceLegs(celtman))).toBe('3.4 km swim, 202 km bike, 41 km run');
    expect(nonStandardTitle(celtman)).toBe('Non-standard distance: 3.4 km swim, 202 km bike, 41 km run');
  });

  it('the fixtures hold exactly one near-standard race', () => {
    expect(
      fixtureRaces()
        .filter(isNearStandard)
        .map((r) => r.id),
    ).toEqual(['independent-celtman-full']);
  });
});
