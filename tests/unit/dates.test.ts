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
    expect(countdown(t, '2027-06-27')).toBe('in 9 months');
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
