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
});
