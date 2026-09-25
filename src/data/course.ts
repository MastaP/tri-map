/**
 * Official swim / bike / run distances. Most races are held over their category's
 * standard distances (DISTANCES); a near-standard race carries `course` with its official
 * km (see "Brand vs series" in data/README.md). Pure, so it is shared by the app, the
 * per-race pages and the data validation.
 */
import { DISTANCES, type DistanceId } from './brands.ts';
import type { Course } from './schema.ts';

export const LEGS = ['swim', 'bike', 'run'] as const;
export type Leg = (typeof LEGS)[number];

/**
 * A race with any leg more than this far off its category's standard is "near-standard"
 * and tagged "Non-standard distance". Smaller deviations are normal course variation.
 */
export const NEAR_STANDARD_TOLERANCE = 0.05;

/** Rounding noise in the comparison (3.99 km vs 3.8 km is exactly 5%, not more). */
const EPSILON = 1e-9;

type WithCourse = { distance: DistanceId; course?: Course | undefined };

export interface Legs {
  swim: number;
  bike: number;
  run: number;
  total: number;
}

/** The km an age-grouper races: the race's own course when it has one, else the standard. */
export function raceLegs(race: WithCourse): Legs {
  const d = DISTANCES[race.distance];
  const { swim, bike, run } = race.course ?? d;
  if (!race.course) return { swim, bike, run, total: d.total };
  return { swim, bike, run, total: Math.round((swim + bike + run) * 10) / 10 };
}

/** How far each leg of the race's course is from its category's standard (0.1 = 10%). */
export function legDeviations(race: WithCourse): Record<Leg, number> {
  const d = DISTANCES[race.distance];
  const legs = race.course ?? d;
  return {
    swim: Math.abs(legs.swim - d.swim) / d.swim,
    bike: Math.abs(legs.bike - d.bike) / d.bike,
    run: Math.abs(legs.run - d.run) / d.run,
  };
}

/** A race whose official course is noticeably (> 5% on a leg) off its category's standard. */
export function isNearStandard(race: WithCourse): boolean {
  if (!race.course) return false;
  const dev = legDeviations(race);
  return LEGS.some((leg) => dev[leg] > NEAR_STANDARD_TOLERANCE + EPSILON);
}

const num = (km: number) => km.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** "3.4 / 202 / 41 km" */
export function legsText(legs: Pick<Legs, Leg>): string {
  return `${num(legs.swim)} / ${num(legs.bike)} / ${num(legs.run)} km`;
}

/** "3.4 km swim, 202 km bike, 41 km run" */
export function legsLong(legs: Pick<Legs, Leg>): string {
  return `${num(legs.swim)} km swim, ${num(legs.bike)} km bike, ${num(legs.run)} km run`;
}

/** Tooltip / accessible text of the "Non-standard distance" tag, listing the real km. */
export function nonStandardTitle(race: WithCourse): string {
  return `Non-standard distance: ${legsLong(raceLegs(race))}`;
}
