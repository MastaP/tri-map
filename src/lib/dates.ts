/**
 * Calendar-date helpers. Race dates are local calendar days (YYYY-MM-DD) with no time
 * zone, so all arithmetic is done in UTC to stay DST-proof.
 */

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const DAY_MS = 86_400_000;

export function toUTC(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the viewer's local time zone. */
export function localToday(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromUTC(new Date(toUTC(iso).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

export function monthKeyOf(iso: ISODate): MonthKey {
  return iso.slice(0, 7);
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

/** Inclusive list of month keys from `from` to `to`. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const n = monthsBetween(from, to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addMonths(from, i));
}

export function isMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

// Explicit English names: Intl output varies between ICU versions ("Sep" vs "Sept").
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function parts(iso: ISODate | MonthKey) {
  const d = toUTC(iso.length === 7 ? `${iso}-01` : iso);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), wd: d.getUTCDay() };
}
const short = (s: string) => s.slice(0, 3);

/** "Sun 28 Jun 2026" */
export function formatDate(iso: ISODate, { year = true }: { year?: boolean } = {}): string {
  const p = parts(iso);
  return `${short(WEEKDAYS[p.wd]!)} ${p.day} ${short(MONTHS[p.m]!)}${year ? ` ${p.y}` : ''}`;
}

/** "Sunday 28 June 2026" */
export function formatLongDate(iso: ISODate): string {
  const p = parts(iso);
  return `${WEEKDAYS[p.wd]} ${p.day} ${MONTHS[p.m]} ${p.y}`;
}

/** "Sat 27 – Sun 28 Jun 2026" for multi-day races, else formatDate. */
export function formatDateRange(date: ISODate, endDate?: ISODate): string {
  if (!endDate || endDate === date) return formatDate(date);
  const sameMonth = date.slice(0, 7) === endDate.slice(0, 7);
  const a = parts(date);
  const start = sameMonth
    ? `${short(WEEKDAYS[a.wd]!)} ${a.day}`
    : formatDate(date, { year: date.slice(0, 4) !== endDate.slice(0, 4) });
  return `${start} – ${formatDate(endDate)}`;
}

/** "Jun 2027" */
export function formatMonthShort(iso: ISODate | MonthKey): string {
  const p = parts(iso);
  return `${short(MONTHS[p.m]!)} ${p.y}`;
}

/** "June 2027" */
export function formatMonthLong(key: MonthKey | ISODate): string {
  const p = parts(key);
  return `${MONTHS[p.m]} ${p.y}`;
}

export function monthAbbrev(key: MonthKey | ISODate): string {
  return short(MONTHS[parts(key).m]!);
}

export function weekdayShort(iso: ISODate): string {
  return short(WEEKDAYS[parts(iso).wd]!);
}

export function dayOfMonth(iso: ISODate): number {
  return Number(iso.slice(8, 10));
}

/** Human countdown from `today` to `date`: "today", "tomorrow", "in 5 weeks", … */
export function countdown(today: ISODate, date: ISODate): string {
  const days = daysBetween(today, date);
  if (days < -1) return `${-days} days ago`;
  if (days === -1) return 'yesterday';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 61) return `in ${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `in ${months} months`;
  const years = Math.round((days / 365.25) * 2) / 2;
  return `in ${years} years`;
}
