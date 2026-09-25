import { addDays, daysBetween, type ISODate } from '../lib/dates.ts';
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
      /** The held edition the estimate was projected from. */
      basedOn: ISODate;
    };

/** 52 weeks: keeps the estimate on the same weekday as the edition it is based on. */
export const ESTIMATE_STEP_DAYS = 364;
/** An estimate this close to a cancelled edition is assumed to be that cancelled year. */
const CANCELLED_WINDOW_DAYS = 60;
const MAX_STEPS = 50;

/**
 * The race's next edition relative to `today`:
 *
 * 1. The first edition on or after today (or still running, via endDate) that is not
 *    cancelled.
 * 2. Otherwise an estimate: the latest non-cancelled edition + 364 days (same weekday),
 *    repeated until it is on or after today, skipping years that were cancelled.
 * 3. null when every known edition was cancelled, or when the race does not recur
 *    (`recurring: false` / `continuedAs` in the data) and has no upcoming edition.
 */
export function computeNextEdition(
  editions: readonly Edition[],
  today: ISODate,
  { recurring = true }: { recurring?: boolean } = {},
): NextEdition | null {
  const sorted = [...editions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const upcoming = sorted.find(
    (e) => e.status !== 'cancelled' && (e.date >= today || (e.endDate !== undefined && e.endDate >= today)),
  );
  if (upcoming) {
    return {
      estimated: false,
      date: upcoming.date,
      ...(upcoming.endDate ? { endDate: upcoming.endDate } : {}),
      status: upcoming.status as 'confirmed' | 'tentative',
    };
  }

  if (!recurring) return null;

  const held = sorted.filter((e) => e.status !== 'cancelled');
  const latest = held.at(-1);
  if (!latest) return null;

  const cancelled = sorted.filter((e) => e.status === 'cancelled').map((e) => e.date);
  const nearCancelled = (d: ISODate) => cancelled.some((c) => Math.abs(daysBetween(c, d)) <= CANCELLED_WINDOW_DAYS);

  let date = latest.date;
  for (let i = 0; i < MAX_STEPS; i++) {
    date = addDays(date, ESTIMATE_STEP_DAYS);
    if (date >= today && !nearCancelled(date)) {
      return { estimated: true, date, status: 'estimated', basedOn: latest.date };
    }
  }
  return null;
}
