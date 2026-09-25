/**
 * zod schema for data/races/*.json. Implements data/README.md exactly; keep the two in
 * sync. Structural rules live here (so both the browser loader and `validate:data`
 * enforce them); cross-file and heuristic checks live in ./validate.ts.
 */
import { z } from 'zod';
import { BRAND_IDS, DISTANCE_IDS } from './brands.ts';
import { isKnownCountry } from './regions.ts';

export const EDITION_STATUSES = ['confirmed', 'tentative', 'cancelled'] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

export const SWIM_TYPES = ['ocean', 'lake', 'river'] as const;
export type SwimType = (typeof SWIM_TYPES)[number];

/** Bike/run course profile, from IRONMAN's own Flat/Rolling/Hilly scale plus "mountainous". */
export const TERRAINS = ['flat', 'rolling', 'hilly', 'mountainous'] as const;
export type Terrain = (typeof TERRAINS)[number];

/** How an age-grouper gets a start: open sign-up, qualification only, or ballot/application. */
export const ENTRY_TYPES = ['open', 'qualification', 'ballot'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

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
