/**
 * Enumerations of the data contract (data/README.md). Kept free of zod so the browser
 * bundle can use them without shipping the schema library; src/data/schema.ts builds
 * the validators from the same lists.
 */

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
