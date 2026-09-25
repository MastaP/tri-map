import { describe, expect, it } from 'vitest';
import { computeNextEdition } from '../../src/data/nextEdition.ts';
import type { Edition } from '../../src/data/schema.ts';
import { weekdayShort } from '../../src/lib/dates.ts';

const ed = (date: string, status: Edition['status'] = 'confirmed', endDate?: string): Edition => ({
  date,
  status,
  ...(endDate ? { endDate } : {}),
});

describe('computeNextEdition', () => {
  it('returns the first upcoming edition', () => {
    const next = computeNextEdition([ed('2026-06-28'), ed('2027-06-27')], '2026-09-25');
    expect(next).toEqual({ estimated: false, date: '2027-06-27', status: 'confirmed' });
  });

  it('treats today as upcoming', () => {
    expect(computeNextEdition([ed('2026-09-25')], '2026-09-25')?.date).toBe('2026-09-25');
  });

  it('keeps a race that is still running thanks to endDate', () => {
    const next = computeNextEdition([ed('2026-09-24', 'confirmed', '2026-09-26')], '2026-09-25');
    expect(next).toEqual({ estimated: false, date: '2026-09-24', endDate: '2026-09-26', status: 'confirmed' });
  });

  it('skips cancelled editions and returns tentative ones', () => {
    const next = computeNextEdition([ed('2026-12-05', 'cancelled'), ed('2027-12-04', 'tentative')], '2026-09-25');
    expect(next).toEqual({ estimated: false, date: '2027-12-04', status: 'tentative' });
  });

  it('estimates from the latest held edition + 364 days, on the same weekday', () => {
    const next = computeNextEdition([ed('2026-07-05')], '2026-09-25');
    expect(next).toEqual({ estimated: true, date: '2027-07-04', status: 'estimated', basedOn: '2026-07-05' });
    expect(weekdayShort(next!.date)).toBe(weekdayShort('2026-07-05'));
  });

  it('repeats the 364-day step until the estimate is on or after today', () => {
    const next = computeNextEdition([ed('2026-03-01')], '2028-06-01');
    expect(next?.estimated).toBe(true);
    expect(next?.date).toBe('2029-02-25'); // 2026-03-01 + 3 × 364
    expect(weekdayShort(next!.date)).toBe(weekdayShort('2026-03-01'));
  });

  it('bases the estimate on the latest non-cancelled edition', () => {
    const next = computeNextEdition([ed('2026-04-12'), ed('2026-08-30', 'cancelled')], '2026-09-25');
    expect(next).toMatchObject({ estimated: true, basedOn: '2026-04-12', date: '2027-04-11' });
  });

  it('does not estimate into a year that is already known to be cancelled', () => {
    const next = computeNextEdition([ed('2026-06-14'), ed('2027-06-13', 'cancelled')], '2026-09-25');
    expect(next).toMatchObject({ estimated: true, date: '2028-06-11' });
  });

  it('returns null when every edition is cancelled', () => {
    expect(computeNextEdition([ed('2026-05-01', 'cancelled')], '2026-09-25')).toBeNull();
  });

  it('does not depend on input order', () => {
    const next = computeNextEdition([ed('2027-06-27'), ed('2026-06-28')], '2026-01-01');
    expect(next?.date).toBe('2026-06-28');
  });
});
