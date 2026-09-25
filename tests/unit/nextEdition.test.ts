import { describe, expect, it } from 'vitest';
import { computeNextEdition, upcomingEditions } from '../../src/data/nextEdition.ts';
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

  it('estimates from the latest held edition: same month, weekday and week of the month', () => {
    const next = computeNextEdition([ed('2026-07-05')], '2026-09-25');
    expect(next).toEqual({ estimated: true, date: '2027-07-04', status: 'estimated', basedOn: '2026-07-05' });
    expect(weekdayShort(next!.date)).toBe(weekdayShort('2026-07-05'));
  });

  it('projects year after year until the estimate is on or after today, without drifting', () => {
    // 2026-03-01 is the 1st Sunday of March; so is 2029-03-04. (52-week steps would have
    // drifted to 2029-02-25, filing the race under February.)
    const next = computeNextEdition([ed('2026-03-01')], '2028-06-01');
    expect(next?.estimated).toBe(true);
    expect(next?.date).toBe('2029-03-04');
    expect(weekdayShort(next!.date)).toBe(weekdayShort('2026-03-01'));
  });

  it('keeps a race held on the 1st of a month in that month (no 364-day drift)', () => {
    // ironman-monterrey-half: held Sun 2026-03-01; 52 weeks later is Sun 2027-02-28.
    expect(computeNextEdition([ed('2026-03-01')], '2026-09-25')).toMatchObject({
      estimated: true,
      date: '2027-03-07',
    });
    // Sun 2026-11-01 → the 1st Sunday of November 2027, not Sun 2027-10-31.
    expect(computeNextEdition([ed('2026-11-01')], '2026-11-02')?.date).toBe('2027-11-07');
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

  it('does not estimate a next edition for races that do not recur', () => {
    expect(computeNextEdition([ed('2026-09-13')], '2026-09-25', { recurring: false })).toBeNull();
    // A listed upcoming edition is still returned.
    expect(computeNextEdition([ed('2026-09-13'), ed('2026-11-08')], '2026-09-25', { recurring: false })).toEqual({
      estimated: false,
      date: '2026-11-08',
      status: 'confirmed',
    });
  });

  it('does not depend on input order', () => {
    const next = computeNextEdition([ed('2027-06-27'), ed('2026-06-28')], '2026-01-01');
    expect(next?.date).toBe('2026-06-28');
  });
});

describe('upcomingEditions', () => {
  it('lists known upcoming editions, then yearly estimates up to the end of next year', () => {
    // Known Oct 2026 edition (like Kona): its 2027 edition is estimated.
    expect(upcomingEditions([ed('2025-10-11'), ed('2026-10-10')], '2026-09-25')).toEqual([
      { estimated: false, date: '2026-10-10', status: 'confirmed' },
      { estimated: true, date: '2027-10-09', status: 'estimated', basedOn: '2026-10-10' },
    ]);
    // Both years known (like Busselton): nothing to estimate before the horizon.
    expect(upcomingEditions([ed('2026-12-06'), ed('2027-12-05')], '2026-09-25').map((e) => e.date)).toEqual([
      '2026-12-06',
      '2027-12-05',
    ]);
  });

  it('always keeps the first estimate, even beyond the horizon', () => {
    expect(upcomingEditions([ed('2024-05-05')], '2026-09-25', { horizonYear: 2026 })).toEqual([
      { estimated: true, date: '2027-05-02', status: 'estimated', basedOn: '2024-05-05' },
    ]);
  });

  it('keeps a running multi-day edition and skips cancelled years', () => {
    const out = upcomingEditions(
      [ed('2026-08-31', 'confirmed', '2026-09-26'), ed('2027-08-30', 'cancelled')],
      '2026-09-25',
      { horizonYear: 2028 },
    );
    expect(out.map((e) => e.date)).toEqual(['2026-08-31', '2028-08-28']);
  });

  it('projects nothing for races that do not recur', () => {
    expect(upcomingEditions([ed('2026-10-10')], '2026-09-25', { recurring: false })).toHaveLength(1);
    expect(upcomingEditions([ed('2026-09-13')], '2026-09-25', { recurring: false })).toEqual([]);
  });
});
