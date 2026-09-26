import { describe, expect, it } from 'vitest';
import { deriveRaces } from '../../src/data/derive.ts';
import {
  attachRegistration,
  editionMatches,
  EDITION_MATCH_DAYS,
  HIDDEN_BY_SOLD_OUT,
  isFresh,
  isOverdue,
  REGISTRATION_MAX_AGE_DAYS,
  registrationFor,
  registrationSources,
  shownRegistration,
  type RegistrationData,
} from '../../src/data/registration.ts';
import type { NextEdition } from '../../src/data/nextEdition.ts';
import { asOfText, registrationSummary } from '../../src/lib/raceText.ts';
import type { RaceRecord } from '../../src/data/schema.ts';
import { fixtureFiles, fixtureRaces, fixtureRegistrationFiles, makeRecord, TODAY, inTimeZone } from './helpers.ts';

inTimeZone('UTC');

const known = (date: string): NextEdition => ({ estimated: false, date, status: 'confirmed' });
const estimate = (date: string): NextEdition => ({ estimated: true, date, status: 'estimated', basedOn: '2026-06-28' });

const fixtureData = (): RegistrationData =>
  Object.fromEntries(
    fixtureRegistrationFiles()
      .filter((f) => f.name === 'ironman.json' || f.name === 't100.json')
      .map((f) => [f.name.replace('.json', ''), JSON.parse(f.text)]),
  );

describe('freshness', () => {
  it('shows a status for 30 days, not longer', () => {
    expect(REGISTRATION_MAX_AGE_DAYS).toBe(30);
    expect(isFresh('2026-09-25T05:00:00.000Z', '2026-09-25')).toBe(true);
    expect(isFresh('2026-08-26T23:59:59.000Z', '2026-09-25')).toBe(true); // 30 days
    expect(isFresh('2026-08-25T00:00:00.000Z', '2026-09-25')).toBe(false); // 31 days
    // A check "tomorrow" in UTC is today somewhere: still fresh.
    expect(isFresh('2026-09-26T01:00:00.000Z', '2026-09-25')).toBe(true);
  });
});

describe('editionMatches', () => {
  it('matches the same edition within ±3 days (Saturday vs Sunday of a race weekend)', () => {
    expect(EDITION_MATCH_DAYS).toBe(3);
    expect(editionMatches('2026-11-16', known('2026-11-15'))).toBe(true);
    expect(editionMatches('2026-11-12', known('2026-11-15'))).toBe(true);
    expect(editionMatches('2026-11-19', known('2026-11-15'))).toBe(false);
    expect(editionMatches('2027-09-26', known('2027-09-19'))).toBe(false);
  });

  it('matches by year when only the year is known, on either side', () => {
    expect(editionMatches('2027', known('2027-06-27'))).toBe(true);
    expect(editionMatches('2026', known('2027-06-27'))).toBe(false);
    expect(editionMatches('2027-07-04', estimate('2027-06-27'))).toBe(true);
    expect(editionMatches('2026-07-04', estimate('2027-06-27'))).toBe(false);
  });

  it("never matches last year's edition to this year's", () => {
    expect(editionMatches('2026-05-10', known('2027-05-09'))).toBe(false);
  });
});

describe('registrationFor / attachRegistration', () => {
  const data: RegistrationData = {
    ironman: {
      source: 'https://www.ironman.com/races',
      checkedAt: '2026-09-24T12:00:00.000Z',
      races: {
        'ironman-testville-full': {
          status: 'sold-out',
          label: 'Registration Sold Out',
          method: 'finder',
          editionDate: '2027-06-27',
          url: 'https://www.ironman.com/races/im-testville',
        },
      },
    },
  };
  const race = deriveRaces([makeRecord()], TODAY)[0]!;

  it('attaches a fresh status about the next edition', () => {
    expect(registrationFor(race, data, TODAY)).toEqual({
      source: 'ironman',
      status: 'sold-out',
      label: 'Registration Sold Out',
      method: 'finder',
      editionDate: '2027-06-27',
      url: 'https://www.ironman.com/races/im-testville',
      checkedAt: '2026-09-24T12:00:00.000Z',
    });
  });

  it('ignores a stale status, another edition, a missing edition date and races without a next edition', () => {
    expect(registrationFor(race, data, '2026-10-25')).toBeUndefined();
    const other = structuredClone(data);
    other.ironman!.races['ironman-testville-full']!.editionDate = '2026-06-28';
    expect(registrationFor(race, other, TODAY)).toBeUndefined();
    delete other.ironman!.races['ironman-testville-full']!.editionDate;
    expect(registrationFor(race, other, TODAY)).toBeUndefined();
    expect(registrationFor({ ...race, nextEdition: null }, data, TODAY)).toBeUndefined();
  });

  it('does not show "opens soon" once its opening date has passed', () => {
    const soon = structuredClone(data);
    const e = soon.ironman!.races['ironman-testville-full']!;
    e.status = 'opening-soon';
    e.opens = '2026-09-30';
    expect(registrationFor(race, soon, TODAY)?.status).toBe('opening-soon'); // opens in 5 days
    expect(registrationFor(race, soon, '2026-09-30')?.opens).toBe('2026-09-30'); // opens today
    expect(registrationFor(race, soon, '2026-10-01')).toBeUndefined(); // opened yesterday: open or sold out by now
    // Without a known opening date, or for another status, the date does not matter.
    delete e.opens;
    expect(registrationFor(race, soon, '2026-10-01')?.status).toBe('opening-soon');
    expect(isOverdue({ status: 'sold-out', opens: '2026-09-01' }, TODAY)).toBe(false);
    expect(isOverdue({ status: 'opening-soon', opens: '2026-09-24' }, TODAY)).toBe(true);
  });

  it("uses an entry's own checkedAt (kept from an earlier refresh) for its age", () => {
    const kept = structuredClone(data);
    kept.ironman!.races['ironman-testville-full']!.checkedAt = '2026-08-01T06:00:00.000Z';
    expect(registrationFor(race, kept, TODAY)).toBeUndefined();
    expect(registrationFor(race, kept, '2026-08-20')?.checkedAt).toBe('2026-08-01T06:00:00.000Z');
  });

  it('derives the fixture races with their status: only fresh statuses about the next edition', () => {
    const records = fixtureFiles().flatMap((f) => JSON.parse(f.text) as RaceRecord[]);
    const races = deriveRaces(records, TODAY, fixtureData());
    const status = Object.fromEntries(races.filter((r) => r.registration).map((r) => [r.id, r.registration!.status]));
    expect(status).toEqual({
      'ironman-bahrain-half': 'general-sold-out',
      'ironman-cascais-half': 'closed',
      'ironman-cozumel-full': 'sold-out',
      'ironman-frankfurt-full': 'open',
      'ironman-south-africa-full': 'opening-soon',
    });
    // Da Nang's status is about its 2026 edition (held), and the T100 file is 55 days old.
    expect(races.find((r) => r.id === 'ironman-da-nang-half')!.registration).toBeUndefined();
    expect(races.find((r) => r.id === 't100-dubai-t100')!.registration).toBeUndefined();
  });

  it('attachRegistration leaves races without a status untouched', () => {
    const races = fixtureRaces();
    const out = attachRegistration(races, fixtureData(), TODAY);
    expect(out.find((r) => r.id === 'challenge-roth-full')).toBe(races.find((r) => r.id === 'challenge-roth-full'));
  });
});

describe('shownRegistration', () => {
  const race = attachRegistration(fixtureRaces(), fixtureData(), TODAY).find((r) => r.id === 'ironman-cozumel-full')!;

  it('shows the status only next to the next edition, which it is about', () => {
    expect(shownRegistration(race, race.nextEdition)?.status).toBe('sold-out');
    expect(shownRegistration(race, known('2027-11-21'))).toBeUndefined();
    expect(shownRegistration(race, null)).toBeUndefined();
  });

  it('"Hide sold out" hides sold-out, waitlist and closed, but not general-sold-out', () => {
    expect([...HIDDEN_BY_SOLD_OUT].sort()).toEqual(['closed', 'sold-out', 'waitlist']);
  });
});

describe('texts', () => {
  it('says when the status was checked', () => {
    expect(asOfText('2026-09-24T12:00:00.000Z', TODAY)).toBe('as of 24 Sep');
    expect(asOfText('2026-12-30T12:00:00.000Z', '2027-01-05')).toBe('as of 30 Dec 2026');
    expect(asOfText('2026-09-24T12:00:00.000Z', TODAY, { year: true })).toBe('as of 24 Sep 2026');
    const reg = {
      source: 'ironman',
      status: 'waitlist',
      label: 'x',
      method: 'finder',
      editionDate: '2026-11-22',
      checkedAt: '2026-09-24T12:00:00.000Z',
    } as const;
    expect(registrationSummary(reg, TODAY)).toBe('Sold out, waitlist open as of 24 Sep 2026');
  });

  it('summarises the sources and whether they are fresh enough to show', () => {
    expect(registrationSources(fixtureData(), TODAY)).toEqual([
      { id: 'ironman', checkedAt: '2026-09-24T12:00:00.000Z', fresh: true },
      { id: 't100', checkedAt: '2026-08-01T12:00:00.000Z', fresh: false },
    ]);
  });
});
