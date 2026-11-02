import { describe, expect, it } from 'vitest';
import {
  hasOwnLegs,
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
    // DTS Bosbaan sprint: 24 km bike is 20% over the 20 km standard.
    expect(isNearStandard({ distance: 'sprint', course: { swim: 0.75, bike: 24, run: 5 } })).toBe(true);
  });

  it('measures each leg against its own category', () => {
    const dev = legDeviations({ distance: 'half', course: { swim: 2, bike: 90, run: 19 } });
    expect(dev.swim).toBeCloseTo(0.0526, 3);
    expect(dev.bike).toBe(0);
    expect(dev.run).toBeCloseTo(0.0995, 3);
  });

  it('gives the official km, else the standard ones', () => {
    expect(raceLegs(full())).toEqual({
      legs: [
        { key: 'swim', km: 3.8 },
        { key: 'bike', km: 180 },
        { key: 'run', km: 42.2 },
      ],
      total: 226,
    });
    expect(raceLegs(full({ swim: 3.4, bike: 202, run: 41 })).total).toBe(246.4);
    expect(raceLegs({ distance: 't100' }).total).toBe(100);
    expect(raceLegs({ distance: 'olympic' }).legs.map((l) => l.km)).toEqual([1.5, 40, 10]);
    expect(raceLegs({ distance: 'sprint' }).legs.map((l) => l.km)).toEqual([0.75, 20, 5]);
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

describe('duathlons and time trials', () => {
  const duathlon = { distance: 'duathlon' as const, course: { run1: 10, bike: 56, run2: 10 } };
  const timeTrial = { distance: 'time-trial' as const, course: { bike: 42 } };

  it('race over their own legs, in race order', () => {
    expect(raceLegs(duathlon)).toEqual({
      legs: [
        { key: 'run1', km: 10 },
        { key: 'bike', km: 56 },
        { key: 'run2', km: 10 },
      ],
      total: 76,
    });
    expect(raceLegs(timeTrial)).toEqual({ legs: [{ key: 'bike', km: 42 }], total: 42 });
  });

  it('write their km run–bike–run, or the bike alone', () => {
    expect(legsText(raceLegs(duathlon))).toBe('10 / 56 / 10 km');
    expect(legsLong(raceLegs(duathlon))).toBe('10 km run, 56 km bike, 10 km run');
    expect(legsText(raceLegs(timeTrial))).toBe('42 km');
    expect(legsLong(raceLegs(timeTrial))).toBe('42 km bike');
  });

  it('include off-road triathlons, swum, biked and run over their own legs', () => {
    const xterra = { distance: 'cross' as const, course: { swim: 1.5, bike: 30, run: 10 } };
    expect(raceLegs(xterra)).toEqual({
      legs: [
        { key: 'swim', km: 1.5 },
        { key: 'bike', km: 30 },
        { key: 'run', km: 10 },
      ],
      total: 41.5,
    });
    expect(legsLong(raceLegs(xterra))).toBe('1.5 km swim, 30 km bike, 10 km run');
    expect(isNearStandard(xterra)).toBe(false);
    expect(hasOwnLegs(xterra)).toBe(true);
  });

  it('have no standard, so they are never "non-standard" but always show their own km', () => {
    expect(isNearStandard(duathlon)).toBe(false);
    expect(isNearStandard(timeTrial)).toBe(false);
    expect(legDeviations(duathlon)).toEqual({});
    expect(hasOwnLegs(duathlon)).toBe(true);
    expect(hasOwnLegs(timeTrial)).toBe(true);
    expect(hasOwnLegs(full())).toBe(false);
    expect(hasOwnLegs(full({ swim: 3.4, bike: 202, run: 41 }))).toBe(true);
  });
});
