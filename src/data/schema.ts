/**
 * zod schema for data/races/*.json. Implements data/README.md exactly; keep the two in
 * sync. Structural rules live here (so both the browser loader and `validate:data`
 * enforce them); cross-file and heuristic checks live in ./validate.ts.
 */
import { z } from 'zod';
import { BRAND_IDS, DISTANCE_IDS, DISTANCES } from './brands.ts';
import { LEG_DISCIPLINE, SPORT_LEGS } from './course.ts';
import { EDITION_STATUSES, ENTRY_TYPES, SWIM_TYPES, TERRAINS } from './constants.ts';
import { isKnownCountry } from './regions.ts';

export {
  EDITION_STATUSES,
  ENTRY_TYPES,
  SWIM_TYPES,
  TERRAINS,
  type EditionStatus,
  type EntryType,
  type SwimType,
  type Terrain,
} from './constants.ts';

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
export const isoDate = z
  .string()
  .regex(ISO_DATE, 'must be a date in YYYY-MM-DD format')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'is not a real calendar date');

export const httpsUrl = z.string().refine((s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
}, 'must be an absolute https:// URL');

/** `<brand>-<location-slug>-<distance>`, kebab-case ASCII. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

export const EditionSchema = z
  .strictObject({
    date: isoDate,
    endDate: isoDate.optional(),
    status: z.enum(EDITION_STATUSES),
  })
  .refine((e) => e.endDate === undefined || e.endDate >= e.date, {
    message: 'endDate must be on or after date',
    path: ['endDate'],
  });

export type Edition = z.infer<typeof EditionSchema>;

const km = z.number().positive();

/**
 * Official km of each leg, for races not held over a standard distance: swim / bike / run
 * for a triathlon, run1 / bike / run2 for a duathlon, bike alone for a time trial (which
 * legs a race needs is checked against its distance below).
 */
export const CourseSchema = z.strictObject({
  swim: km.optional(),
  run1: km.optional(),
  bike: km,
  run: km.optional(),
  run2: km.optional(),
});

export type Course = z.infer<typeof CourseSchema>;

export const RaceSchema = z
  .strictObject({
    id: z.string().regex(ID_PATTERN, 'must be kebab-case ASCII (a-z, 0-9, "-")'),
    name: z.string().trim().min(3),
    brand: z.enum(BRAND_IDS),
    series: z.string().trim().min(1).optional(),
    distance: z.enum(DISTANCE_IDS),
    championship: z.string().trim().min(3).optional(),
    city: z.string().trim().min(1),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, 'must be an uppercase ISO 3166-1 alpha-2 code')
      .refine(isKnownCountry, 'is not a known country code (see src/data/regions.ts)'),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    url: httpsUrl,
    editions: z.array(EditionSchema).min(1, 'needs at least one edition'),
    swim: z.enum(SWIM_TYPES).optional(),
    bike: z.enum(TERRAINS).optional(),
    run: z.enum(TERRAINS).optional(),
    course: CourseSchema.optional(),
    entry: z.enum(ENTRY_TYPES).optional(),
    recurring: z.boolean().optional(),
    continuedAs: z.string().regex(ID_PATTERN, 'must be the id of another race').optional(),
    notes: z.string().trim().min(1).max(140, 'must be at most 140 characters').optional(),
    sources: z.array(httpsUrl).min(1, 'needs at least one source URL'),
    verifiedAt: isoDate,
  })
  .superRefine((race, ctx) => {
    if (!race.id.startsWith(`${race.brand}-`) || !race.id.endsWith(`-${race.distance}`)) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `must follow <brand>-<location-slug>-<distance>, i.e. "${race.brand}-…-${race.distance}"`,
      });
    }
    if (race.continuedAs !== undefined) {
      if (race.continuedAs === race.id) {
        ctx.addIssue({ code: 'custom', path: ['continuedAs'], message: 'must not point at the race itself' });
      }
      if (race.recurring === true) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurring'],
          message: 'cannot be true when continuedAs is set (the race is replaced, so it does not recur)',
        });
      }
    }
    const category = DISTANCES[race.distance];
    const legs = SPORT_LEGS[category.sport];
    if (race.course === undefined) {
      if (!category.standard) {
        ctx.addIssue({
          code: 'custom',
          path: ['course'],
          message: `${category.badgeLong} has no standard distance: give its ${legs.join(' / ')} km`,
        });
      }
    } else {
      const given = Object.keys(race.course);
      const wrong = given.filter((k) => !(legs as readonly string[]).includes(k));
      if (wrong.length || given.length !== legs.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['course'],
          message: `a ${category.sport} needs exactly ${legs.join(', ')}${wrong.length ? ` (not ${wrong.join(', ')})` : ''}`,
        });
      } else if (category.standard) {
        const { standard, maxDeviation } = category;
        for (const leg of ['swim', 'bike', 'run'] as const) {
          const km = race.course[leg] ?? 0;
          if (Math.abs(km - standard[leg]) / standard[leg] > maxDeviation) {
            ctx.addIssue({
              code: 'custom',
              path: ['course', leg],
              message: `${km} km is more than ${maxDeviation * 100}% off the ${category.long.toLowerCase()} ${leg} (${standard[leg]} km); the race is out of scope`,
            });
          }
        }
      }
    }
    if (race.swim !== undefined && !legs.includes('swim')) {
      ctx.addIssue({ code: 'custom', path: ['swim'], message: `a ${category.sport} has no swim` });
    }
    if (race.run !== undefined && !legs.some((l) => LEG_DISCIPLINE[l] === 'run')) {
      ctx.addIssue({ code: 'custom', path: ['run'], message: `a ${category.sport} has no run` });
    }
    // The slug between brand and distance must not be empty.
    if (race.id.length <= race.brand.length + race.distance.length + 2) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'is missing the location slug' });
    }
    for (let i = 1; i < race.editions.length; i++) {
      const prev = race.editions[i - 1]!;
      const cur = race.editions[i]!;
      if (cur.date <= prev.date) {
        ctx.addIssue({
          code: 'custom',
          path: ['editions', i, 'date'],
          message: `editions must be sorted by date ascending without duplicates (${prev.date} then ${cur.date})`,
        });
      }
    }
  });

export type RaceRecord = z.infer<typeof RaceSchema>;

export const RaceFileSchema = z.array(RaceSchema);

/** Human-friendly one-line rendering of a zod issue path, e.g. `[3].editions[1].date`. */
export function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))
    .join('')
    .replace(/^\./, '');
}
