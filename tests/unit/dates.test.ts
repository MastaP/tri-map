import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  countdown,
  daysBetween,
  formatDate,
  formatDateRange,
  formatMonthShort,
  localToday,
  monthRange,
  sameWeekdayInYear,
} from '../../src/lib/dates.ts';

describe('dates', () => {
  it('does calendar arithmetic across DST and leap years', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-09-25', '2027-09-25')).toBe(365);
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('formats dates', () => {
    expect(formatDate('2026-06-28')).toBe('Sun 28 Jun 2026');
    expect(formatDate('2026-06-28', { year: false })).toBe('Sun 28 Jun');
    expect(formatDateRange('2026-06-27', '2026-06-28')).toBe('Sat 27 – Sun 28 Jun 2026');
    expect(formatMonthShort('2027-06')).toBe('Jun 2027');
  });

  it('reads today in local time', () => {
    expect(localToday(new Date(2026, 8, 25, 23, 59))).toBe('2026-09-25');
  });

  it('writes friendly countdowns', () => {
    const t = '2026-09-25';
    expect(countdown(t, '2026-09-25')).toBe('today');
    expect(countdown(t, '2026-09-26')).toBe('tomorrow');
    expect(countdown(t, '2026-09-30')).toBe('in 5 days');
    expect(countdown(t, '2026-10-30')).toBe('in 5 weeks');
    // Weeks up to a year out: training plans are counted in weeks.
    expect(countdown(t, '2027-06-27')).toBe('in 39 weeks');
    expect(countdown(t, '2027-09-24')).toBe('in 52 weeks');
    expect(countdown(t, '2027-09-25')).toBe('in 12 months');
    expect(countdown(t, '2028-01-25')).toBe('in 16 months');
    expect(countdown(t, '2028-09-25')).toBe('in 2 years');
  });
});

describe('month names', () => {
  it('uses three-letter English abbreviations regardless of ICU', async () => {
    const { formatMonthShort, formatMonthLong, monthAbbrev } = await import('../../src/lib/dates.ts');
    expect(formatMonthShort('2026-09')).toBe('Sep 2026');
    expect(formatMonthShort('2026-09-25')).toBe('Sep 2026');
    expect(formatMonthLong('2026-09')).toBe('September 2026');
    expect(monthAbbrev('2027-01')).toBe('Jan');
  });
});

describe('sameWeekdayInYear', () => {
  it('keeps the month, the weekday and the week of the month', () => {
    expect(sameWeekdayInYear('2026-03-01', 2027)).toBe('2027-03-07'); // 1st Sunday of March
    expect(sameWeekdayInYear('2026-06-28', 2027)).toBe('2027-06-27'); // 4th Sunday of June
    expect(sameWeekdayInYear('2026-10-10', 2027)).toBe('2027-10-09'); // 2nd Saturday of October
    expect(sameWeekdayInYear('2026-12-06', 2028)).toBe('2028-12-03'); // 1st Sunday of December
  });

  it('uses the last weekday when the month has no 5th one', () => {
    expect(sameWeekdayInYear('2026-08-30', 2027)).toBe('2027-08-29'); // 5th Sunday exists
    expect(sameWeekdayInYear('2026-05-31', 2028)).toBe('2028-05-28'); // no 5th Sunday in May 2028
  });
});
