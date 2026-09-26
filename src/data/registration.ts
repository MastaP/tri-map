/**
 * Registration status: can an age-grouper still enter a race's next edition?
 *
 * The status comes from generated files (data/registration/<source>.json, see
 * data/README.md) for the organisers whose entry status can be read: IRONMAN (ironman.com,
 * refreshed by hand with `npm run refresh:ironman`) and the T100 World Championship Tour
 * (t100triathlon.com and the PTO entry platform, refreshed daily in CI with
 * `npm run refresh:t100`). Races from other organisers have no status.
 *
 * Pure and free of zod: the files are validated at build time (src/data/validateRegistration.ts)
 * and attached to the races here, in the browser.
 */
import { daysBetween, localToday, type ISODate } from '../lib/dates.ts';
import type { NextEdition } from './nextEdition.ts';
import type { Race } from './types.ts';

export const REGISTRATION_STATUSES = [
  'open',
  'opening-soon',
  'sold-out',
  'general-sold-out',
  'waitlist',
  'closed',
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_SOURCE_IDS = ['ironman', 't100'] as const;
export type RegistrationSourceId = (typeof REGISTRATION_SOURCE_IDS)[number];

export interface RegistrationSourceInfo {
  /** Which races the source covers, in words ("IRONMAN and IRONMAN 70.3"). */
  covers: string;
  /** Where the status is read ("ironman.com race finder"). */
  from: string;
  /** Races of this brand take their status from this file. */
  brand: Race['brand'];
}

export const REGISTRATION_SOURCES: Record<RegistrationSourceId, RegistrationSourceInfo> = {
  ironman: { covers: 'IRONMAN and IRONMAN 70.3', from: 'ironman.com', brand: 'ironman' },
  t100: { covers: 'T100 World Championship Tour', from: 't100triathlon.com and the PTO entry platform', brand: 't100' },
};

/**
 * How a status was read (data/README.md, "Registration status"):
 *
 * - `finder`: the ironman.com race finder's status tag on the race's card;
 * - `register-page`: the race's ironman.com registration page, for a race the finder tags
 *   "Flex90 Eligible" (that tag does not say whether general entry is sold out);
 * - `race-page`: the race's ironman.com page, for a race with an announced next edition
 *   but no card in the finder;
 * - `organiser`: t100triathlon.com's own entry status for the race (what its entry
 *   buttons show);
 * - `platform`: the PTO entry platform's explicit settings (not published yet, entries
 *   closed, waiting list…), when t100triathlon.com could not be read.
 */
export const REGISTRATION_METHODS = ['finder', 'register-page', 'race-page', 'organiser', 'platform'] as const;
export type RegistrationMethod = (typeof REGISTRATION_METHODS)[number];

export const REGISTRATION_METHOD_INFO: Record<RegistrationMethod, { source: RegistrationSourceId; where: string }> = {
  finder: { source: 'ironman', where: 'the ironman.com race finder' },
  'register-page': { source: 'ironman', where: "the race's ironman.com registration page" },
  'race-page': { source: 'ironman', where: "the race's ironman.com page" },
  organiser: { source: 't100', where: 't100triathlon.com' },
  platform: { source: 't100', where: 'the PTO entry platform' },
};

/** One race in a registration file (data/README.md, "Registration status"). */
export interface RegistrationEntry {
  status: RegistrationStatus;
  /** The source's own wording, e.g. "Registration Sold Out" or "ENTRIES SOLD OUT · Triathlon - 100km - Individual". */
  label: string;
  /** How the status was read (REGISTRATION_METHODS). */
  method: RegistrationMethod;
  /** The edition the status is about: YYYY-MM-DD, or YYYY when only the year is known. */
  editionDate?: string;
  /** Where to enter or check, when the source links to it. */
  url?: string;
  /** When entries open (YYYY-MM-DD), for "opening-soon", when the source says. */
  opens?: ISODate;
  /**
   * When this entry was last read, if earlier than the file's `checkedAt`: a refresh that
   * could not reach one race keeps its previous entry with its own date.
   */
  checkedAt?: string;
}

export interface RegistrationFile {
  /** The page or API the file was generated from. */
  source: string;
  /** ISO timestamp of the refresh that wrote the file. */
  checkedAt: string;
  races: Record<string, RegistrationEntry>;
}

export type RegistrationData = Partial<Record<RegistrationSourceId, RegistrationFile>>;

/** A status attached to a race: it is about the race's next edition and is fresh. */
export interface RaceRegistration {
  source: RegistrationSourceId;
  status: RegistrationStatus;
  label: string;
  method: RegistrationMethod;
  editionDate: string;
  url?: string;
  opens?: ISODate;
  /** ISO timestamp of the check. */
  checkedAt: string;
}

/** A status older than this (in days) is not shown: entries sell out and open all the time. */
export const REGISTRATION_MAX_AGE_DAYS = 30;

/**
 * A status's edition may differ from our date by this many days and still be the same
 * edition (race weekends: the entry platform may give the Saturday, we the Sunday).
 */
export const EDITION_MATCH_DAYS = 3;

/** The calendar day of a check (an ISO timestamp) in the local time zone, like `today`. */
export function checkedDay(checkedAt: string): ISODate {
  return localToday(new Date(checkedAt));
}

/** Whether a status checked at `checkedAt` is recent enough to show on `today`. */
export function isFresh(checkedAt: string, today: ISODate): boolean {
  return daysBetween(checkedDay(checkedAt), today) <= REGISTRATION_MAX_AGE_DAYS;
}

/**
 * Whether a status about the edition on `editionDate` is about `next`: the same date
 * ± EDITION_MATCH_DAYS, or the same year when only the year is known (a YYYY editionDate,
 * or a next edition whose date is only estimated).
 */
export function editionMatches(editionDate: string, next: Pick<NextEdition, 'date' | 'estimated'>): boolean {
  if (/^\d{4}$/.test(editionDate)) return next.date.slice(0, 4) === editionDate;
  if (next.estimated) return next.date.slice(0, 4) === editionDate.slice(0, 4);
  return Math.abs(daysBetween(editionDate, next.date)) <= EDITION_MATCH_DAYS;
}

/**
 * Whether an entry has outlived itself: "opening soon" with an opening date that has
 * passed (entries are open by now, or sold out, or were postponed: we cannot tell which).
 */
export function isOverdue(entry: Pick<RegistrationEntry, 'status' | 'opens'>, today: ISODate): boolean {
  return entry.status === 'opening-soon' && entry.opens !== undefined && entry.opens < today;
}

/**
 * The registration status to show for a race on `today`, or undefined: there must be an
 * entry for the race, about its next edition, checked at most REGISTRATION_MAX_AGE_DAYS
 * ago, and not an "opening soon" whose opening date has passed. Anything else (a past
 * edition, an unknown edition date, a stale file, an overdue opening) is ignored.
 */
export function registrationFor(
  race: Pick<Race, 'id' | 'nextEdition'>,
  data: RegistrationData,
  today: ISODate,
): RaceRegistration | undefined {
  const next = race.nextEdition;
  if (!next) return undefined;
  for (const source of REGISTRATION_SOURCE_IDS) {
    const file = data[source];
    const entry = file?.races[race.id];
    if (!file || !entry?.editionDate) continue;
    if (!editionMatches(entry.editionDate, next)) continue;
    const checkedAt = entry.checkedAt ?? file.checkedAt;
    if (!isFresh(checkedAt, today) || isOverdue(entry, today)) continue;
    return {
      source,
      status: entry.status,
      label: entry.label,
      method: entry.method,
      editionDate: entry.editionDate,
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.opens ? { opens: entry.opens } : {}),
      checkedAt,
    };
  }
  return undefined;
}

/** Races with their registration status attached (`registration`), as new objects where it changes. */
export function attachRegistration(races: readonly Race[], data: RegistrationData, today: ISODate): Race[] {
  return races.map((r) => {
    const registration = registrationFor(r, data, today);
    return registration ? { ...r, registration } : r;
  });
}

/**
 * The status to show next to `edition`: only when it is the race's next edition, which
 * is the one the status is about. (A 2027 search can show a race with its 2027 date while
 * the status describes the 2026 edition.)
 */
export function shownRegistration(
  race: Pick<Race, 'registration' | 'nextEdition'>,
  edition: NextEdition | null | undefined,
): RaceRegistration | undefined {
  if (!race.registration || !edition || !race.nextEdition) return undefined;
  return edition.date === race.nextEdition.date ? race.registration : undefined;
}

/**
 * Statuses "Hide sold out" hides: no entry left (a waitlist is sold out too) or entries
 * closed. "General entry sold out" stays: charity or travel-package places may remain.
 */
export const HIDDEN_BY_SOLD_OUT: ReadonlySet<RegistrationStatus> = new Set(['sold-out', 'waitlist', 'closed']);

/** Per source: when it was checked and whether that is recent enough to show. */
export interface RegistrationSourceSummary {
  id: RegistrationSourceId;
  checkedAt: string;
  fresh: boolean;
}

export function registrationSources(data: RegistrationData, today: ISODate): RegistrationSourceSummary[] {
  return REGISTRATION_SOURCE_IDS.flatMap((id) => {
    const file = data[id];
    return file ? [{ id, checkedAt: file.checkedAt, fresh: isFresh(file.checkedAt, today) }] : [];
  });
}
