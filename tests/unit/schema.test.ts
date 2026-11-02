import { describe, expect, it } from 'vitest';
import { RaceSchema } from '../../src/data/schema.ts';
import { makeRecord } from './helpers.ts';

const messages = (input: unknown) => {
  const r = RaceSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('RaceSchema', () => {
  it('accepts a complete, valid record', () => {
    expect(messages(makeRecord({ swim: 'lake', notes: 'Hilly bike', championship: 'European Championship' }))).toEqual(
      [],
    );
  });

  it('rejects ids that do not follow <brand>-<slug>-<distance>', () => {
    expect(messages(makeRecord({ id: 'challenge-testville-full' })).join()).toMatch(/^id: must follow/);
    expect(messages(makeRecord({ id: 'ironman-testville-half' })).join()).toMatch(/^id: must follow/);
    expect(messages(makeRecord({ id: 'ironman-full' })).join()).toMatch(/id:/);
    expect(messages(makeRecord({ id: 'IRONMAN-Testville-full' })).join()).toMatch(/kebab-case/);
  });

  it('requires sorted editions without duplicates', () => {
    const out = messages(
      makeRecord({
        editions: [
          { date: '2027-06-27', status: 'confirmed' },
          { date: '2026-06-28', status: 'confirmed' },
        ],
      }),
    );
    expect(out.join()).toMatch(/editions.1.date: editions must be sorted/);
  });

  it('rejects impossible dates and endDate before date', () => {
    expect(messages(makeRecord({ editions: [{ date: '2027-02-30', status: 'confirmed' }] })).join()).toMatch(
      /real calendar date/,
    );
    expect(
      messages(makeRecord({ editions: [{ date: '2027-06-27', endDate: '2027-06-26', status: 'confirmed' }] })).join(),
    ).toMatch(/endDate must be on or after date/);
  });

  it('rejects unknown countries, lower-case codes and http urls', () => {
    expect(messages(makeRecord({ country: 'ZZ' })).join()).toMatch(/not a known country/);
    expect(messages(makeRecord({ country: 'de' })).join()).toMatch(/uppercase/);
    expect(messages(makeRecord({ url: 'http://example.com' })).join()).toMatch(/https/);
    expect(messages(makeRecord({ sources: ['ftp://example.com'] })).join()).toMatch(/sources.0/);
    expect(messages(makeRecord({ sources: [] })).join()).toMatch(/at least one source/);
  });

  it('rejects unknown enum values, long notes and unknown keys', () => {
    expect(messages({ ...makeRecord(), brand: 'xterra' }).length).toBeGreaterThan(0);
    expect(messages(makeRecord({ swim: 'sea' as never })).join()).toMatch(/swim/);
    expect(messages(makeRecord({ notes: 'x'.repeat(141) })).join()).toMatch(/140/);
    expect(messages({ ...makeRecord(), note: 'typo' }).join()).toMatch(/note/);
    expect(messages(makeRecord({ editions: [{ date: '2027-06-27', status: 'postponed' as never }] })).length).toBe(1);
  });

  it('rejects out-of-range coordinates', () => {
    expect(messages(makeRecord({ lat: 91 })).join()).toMatch(/lat/);
    expect(messages(makeRecord({ lng: -181 })).join()).toMatch(/lng/);
  });

  describe('sports other than triathlon', () => {
    const indie = (overrides: Parameters<typeof makeRecord>[0]) =>
      makeRecord({ brand: 'independent', series: 'TriHard', ...overrides });

    it('accepts a duathlon with its run / bike / run km and a time trial with its bike km', () => {
      expect(
        messages(
          indie({
            id: 'independent-almere-duathlon',
            distance: 'duathlon',
            course: { run1: 10, bike: 56, run2: 10 },
            bike: 'flat',
            run: 'flat',
          }),
        ),
      ).toEqual([]);
      expect(
        messages(
          indie({ id: 'independent-almere-time-trial', distance: 'time-trial', course: { bike: 42 }, bike: 'flat' }),
        ),
      ).toEqual([]);
    });

    it('accepts an off-road triathlon with its swim / bike / run km and swim type', () => {
      expect(
        messages(
          indie({
            id: 'independent-xterra-molveno-cross',
            series: 'XTERRA World Cup',
            distance: 'cross',
            course: { swim: 1.5, bike: 30, run: 10 },
            swim: 'lake',
            bike: 'mountainous',
            run: 'hilly',
          }),
        ),
      ).toEqual([]);
    });

    it('requires a duathlon or time trial to give its km, with exactly the legs of its sport', () => {
      expect(messages(indie({ id: 'independent-almere-duathlon', distance: 'duathlon' })).join()).toMatch(
        /^course: Duathlon has no standard distance: give its run1 \/ bike \/ run2 km/,
      );
      expect(messages(indie({ id: 'independent-xterra-molveno-cross', distance: 'cross' })).join()).toMatch(
        /^course: Off-road triathlon has no standard distance: give its swim \/ bike \/ run km/,
      );
      expect(
        messages(
          indie({ id: 'independent-almere-duathlon', distance: 'duathlon', course: { swim: 1, bike: 40, run: 10 } }),
        ).join(),
      ).toMatch(/^course: a duathlon needs exactly run1, bike, run2 \(not swim, run\)/);
      expect(
        messages(
          indie({ id: 'independent-almere-time-trial', distance: 'time-trial', course: { run1: 5, bike: 42 } }),
        ).join(),
      ).toMatch(/^course: a time-trial needs exactly bike \(not run1\)/);
      expect(messages(makeRecord({ course: { run1: 5, bike: 180, run2: 5 } })).join()).toMatch(
        /^course: a triathlon needs exactly swim, bike, run/,
      );
    });

    it('rejects a swim type on a race without a swim and a run profile on a time trial', () => {
      const du = {
        id: 'independent-almere-duathlon',
        distance: 'duathlon',
        course: { run1: 10, bike: 56, run2: 10 },
      } as const;
      expect(messages(indie({ ...du, swim: 'lake' })).join()).toMatch(/^swim: a duathlon has no swim/);
      expect(
        messages(
          indie({ id: 'independent-almere-time-trial', distance: 'time-trial', course: { bike: 42 }, run: 'flat' }),
        ).join(),
      ).toMatch(/^run: a time-trial has no run/);
    });

    it('lets a short triathlon vary more than a long one before it is out of scope', () => {
      // A Dutch "achtste" (0.5 / 20 / 5) is a sprint; 0.3 km is too short for one.
      const sprint = (swim: number) =>
        messages(indie({ id: 'independent-almere-sprint', distance: 'sprint', course: { swim, bike: 20, run: 5 } }));
      expect(sprint(0.5)).toEqual([]);
      expect(sprint(0.3).join()).toMatch(/^course.swim: 0.3 km is more than 50% off the sprint distance swim/);
      expect(
        messages(
          indie({ id: 'independent-almere-olympic', distance: 'olympic', course: { swim: 1, bike: 40, run: 10 } }),
        ),
      ).toEqual([]);
    });
  });
});
