import { daysBetween, sameWeekdayInYear, type ISODate } from '../lib/dates.ts';
import type { Edition } from './schema.ts';

export type NextEdition =
  | {
      estimated: false;
      date: ISODate;
      endDate?: ISODate;
      status: 'confirmed' | 'tentative';
    }
  | {
      estimated: true;
      date: ISODate;
      status: 'estimated';
      /** The known edition the estimate was projected from. */
      basedOn: ISODate;
    };

/** An estimate this close to a cancelled edition is assumed to be that cancelled year. */
const CANCELLED_WINDOW_DAYS = 60;
const MAX_YEARS = 50;

export interface EditionOptions {
  /** false for races marked `recurring: false` or `continuedAs`: nothing is projected. */
  recurring?: boolean;
  /**
   * Project yearly estimates up to the end of this year (default: the year after
   * `today`), so a season-planning search ("anything in late 2027?") also finds races
   * whose 2027 date is not announced yet. The first estimate is always kept, however far.
   */
  horizonYear?: number;
}

/**
 * Every edition an age-grouper could still enter, in date order:
 *
 * 1. Known editions on or after today (or still running, via endDate) that are not
 *    cancelled.
 * 2. For recurring races, yearly estimates projected from the latest known edition,
 *    keeping its month, weekday and week of the month (see sameWeekdayInYear), skipping
 *    years that were cancelled, up to the horizon year.
 *
 * Empty when every edition was cancelled, or when a race that does not recur has no
 * upcoming edition.
 */
export function upcomingEditions(
  editions: readonly Edition[],
  today: ISODate,
  { recurring = true, horizonYear = Number(today.slice(0, 4)) + 1 }: EditionOptions = {},
): NextEdition[] {
  const sorted = [...editions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: NextEdition[] = [];
  for (const e of sorted) {
    if (e.status === 'cancelled') continue;
    if (e.date >= today || (e.endDate !== undefined && e.endDate >= today)) {
      out.push({
        estimated: false,
        date: e.date,
        ...(e.endDate ? { endDate: e.endDate } : {}),
        status: e.status,
      });
    }
  }
  if (!recurring) return out;

  const latest = sorted.findLast((e) => e.status !== 'cancelled');
  if (!latest) return out;
  const cancelled = sorted.filter((e) => e.status === 'cancelled').map((e) => e.date);
  const nearCancelled = (d: ISODate) => cancelled.some((c) => Math.abs(daysBetween(c, d)) <= CANCELLED_WINDOW_DAYS);

  const baseYear = Number(latest.date.slice(0, 4));
  for (let year = baseYear + 1; year <= baseYear + MAX_YEARS; year++) {
    if (year > horizonYear && out.length > 0) break;
    const date = sameWeekdayInYear(latest.date, year);
    if (date < today || nearCancelled(date)) continue;
    out.push({ estimated: true, date, status: 'estimated', basedOn: latest.date });
  }
  return out;
}

/**
 * The race's next edition relative to `today`: the first of upcomingEditions(), i.e. the
 * first known upcoming edition, else an estimate, else null (see upcomingEditions).
 */
export function computeNextEdition(
  editions: readonly Edition[],
  today: ISODate,
  { recurring = true }: { recurring?: boolean } = {},
): NextEdition | null {
  return upcomingEditions(editions, today, { recurring, horizonYear: 0 })[0] ?? null;
}
