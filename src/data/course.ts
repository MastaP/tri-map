/**
 * Official distances of each leg. A triathlon is swim / bike / run, a duathlon run / bike /
 * run, a time trial the bike alone. Most triathlons are held over their category's standard
 * distances (DISTANCES); a near-standard one carries `course` with its official km (see
 * "Brand vs series" in data/README.md). Duathlons and time trials have no standard: each
 * carries its own `course`. Pure, so it is shared by the app, the per-race pages and the
 * data validation.
 */
import { DISTANCES, type DistanceId, type SportId } from './brands.ts';
import type { Course } from './schema.ts';

/** A leg of a race: `run1` and `run2` are a duathlon's first and second run. */
export type LegKey = 'swim' | 'run1' | 'bike' | 'run' | 'run2';
export type Discipline = 'swim' | 'bike' | 'run';

/** The legs of each sport, in race order: the keys its `course` must have. */
export const SPORT_LEGS: Record<SportId, readonly LegKey[]> = {
  triathlon: ['swim', 'bike', 'run'],
  duathlon: ['run1', 'bike', 'run2'],
  'time-trial': ['bike'],
};

export const LEG_DISCIPLINE: Record<LegKey, Discipline> = {
  swim: 'swim',
  run1: 'run',
  bike: 'bike',
  run: 'run',
  run2: 'run',
};

/** The course profiles (data `bike` / `run`) a race can have: a time trial has no run. */
export function profiledDisciplines(race: { distance: DistanceId }): ('bike' | 'run')[] {
  const legs = SPORT_LEGS[DISTANCES[race.distance].sport];
  return (['bike', 'run'] as const).filter((d) => legs.some((l) => LEG_DISCIPLINE[l] === d));
}

/**
 * A race with any leg more than this far off its category's standard is "near-standard"
 * and tagged "Non-standard distance". Smaller deviations are normal course variation.
 */
export const NEAR_STANDARD_TOLERANCE = 0.05;

/** Rounding noise in the comparison (3.99 km vs 3.8 km is exactly 5%, not more). */
const EPSILON = 1e-9;

type WithCourse = { distance: DistanceId; course?: Course | undefined };

export interface Leg {
  key: LegKey;
  km: number;
}

export interface Legs {
  /** In race order. */
  legs: Leg[];
  total: number;
}

const round1 = (km: number) => Math.round(km * 10) / 10;

/** The km an age-grouper races: the race's own course when it has one, else the standard. */
export function raceLegs(race: WithCourse): Legs {
  const d = DISTANCES[race.distance];
  const source: Partial<Record<LegKey, number>> = race.course ?? d.standard ?? {};
  const legs = SPORT_LEGS[d.sport].flatMap((key) => {
    const km = source[key];
    return km === undefined ? [] : [{ key, km }];
  });
  const total = !race.course && d.total !== null ? d.total : round1(legs.reduce((sum, l) => sum + l.km, 0));
  return { legs, total };
}

/**
 * How far each leg of the race's course is from its category's standard (0.1 = 10%);
 * empty for a category without a standard.
 */
export function legDeviations(race: WithCourse): Partial<Record<LegKey, number>> {
  const standard = DISTANCES[race.distance].standard;
  if (!standard) return {};
  const legs: Partial<Record<LegKey, number>> = race.course ?? standard;
  const out: Partial<Record<LegKey, number>> = {};
  for (const key of ['swim', 'bike', 'run'] as const) {
    out[key] = Math.abs((legs[key] ?? 0) - standard[key]) / standard[key];
  }
  return out;
}

/** A race whose official course is noticeably (> 5% on a leg) off its category's standard. */
export function isNearStandard(race: WithCourse): boolean {
  if (!race.course) return false;
  return Object.values(legDeviations(race)).some((dev) => dev > NEAR_STANDARD_TOLERANCE + EPSILON);
}

/**
 * Whether cards and tags should spell out the race's own km: a near-standard race, and
 * every duathlon and time trial (no standard to name instead).
 */
export function hasOwnLegs(race: WithCourse): boolean {
  return DISTANCES[race.distance].standard === null || isNearStandard(race);
}

const num = (km: number) => km.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** "3.4 / 202 / 41 km", "42 km" */
export function legsText({ legs }: Pick<Legs, 'legs'>): string {
  return `${legs.map((l) => num(l.km)).join(' / ')} km`;
}

/** "3.4 km swim, 202 km bike, 41 km run", "10 km run, 56 km bike, 10 km run" */
export function legsLong({ legs }: Pick<Legs, 'legs'>): string {
  return legs.map((l) => `${num(l.km)} km ${LEG_DISCIPLINE[l.key]}`).join(', ');
}

/** Tooltip / accessible text of the "Non-standard distance" tag, listing the real km. */
export function nonStandardTitle(race: WithCourse): string {
  return `Non-standard distance: ${legsLong(raceLegs(race))}`;
}
