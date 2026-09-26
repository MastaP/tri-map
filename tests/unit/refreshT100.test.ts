import { describe, expect, it } from 'vitest';
import { deriveRaces } from '../../src/data/derive.ts';
import type { RegistrationFile } from '../../src/data/registration.ts';
import type { Fetcher, HttpResponse } from '../../scripts/registration/common.ts';
import { T100_LIMITS } from '../../scripts/registration/run.ts';
import {
  localDay,
  pickAgeGroup100k,
  readOrganiser,
  readPlatform,
  refreshT100,
  T100_ORGANISER,
  t100ApiUrl,
  t100OrganiserUrl,
  t100Summary,
  type NjukoEdition,
  type PlatformReading,
} from '../../scripts/registration/t100.ts';
import { makeRecord, registrationSample, TODAY, inTimeZone } from './helpers.ts';

inTimeZone('UTC');

const edition = (slug: string) => JSON.parse(registrationSample(`t100/${slug}.json`)) as NjukoEdition;
/** When the samples were saved. */
const NOW = new Date('2026-09-26T06:00:00.000Z');
const platform = (slug: string, now = NOW): PlatformReading => {
  const r = readPlatform(edition(slug.replace('.earlier', '')), slug.replace('.earlier', ''), now);
  if ('error' in r) throw new Error(r.error);
  return r;
};

/** What t100triathlon.com's endpoint answered for each saved edition's 100 km race (2026-09-26). */
const answers = JSON.parse(registrationSample('t100/organiser-answers.json')) as Record<
  string,
  { competition_id?: string; edition_id?: string; answer: Record<string, unknown> }
>;
const answerOf = (slug: string) => JSON.stringify(answers[slug]!.answer);

describe('pickAgeGroup100k', () => {
  it('picks the individual 100 km race, not relays, and the open race next to a championship', () => {
    const name = (slug: string) => {
      const r = pickAgeGroup100k(edition(slug));
      return 'error' in r ? r.error : r.competition.reportName?.trim();
    };
    expect(name('qatar-t100-2026')).toBe('Triathlon - 100km - Individual'); // not "Age-Group World Championships"
    expect(name('marbella-t100-2027')).toBe('Triathlon - 100km - Individual'); // not the team relay
    expect(pickAgeGroup100k({ competitions: [] })).toEqual({
      error: 'no individual 100 km competition in this edition',
    });
    const two = { competitions: [{ name: [{ translation: '100km A' }] }, { name: [{ translation: '100km B' }] }] };
    expect(pickAgeGroup100k(two)).toEqual({ error: 'more than one 100 km competition: "100km A", "100km B"' });
  });
});

describe('readOrganiser (t100triathlon.com)', () => {
  it("maps the organiser's statuses, with its own wording", () => {
    expect(readOrganiser(answerOf('dubai-t100-2026'))).toEqual({ status: 'open', wording: 'REGISTER NOW' });
    expect(readOrganiser(answerOf('london-t100-2027'))).toEqual({
      status: 'opening-soon',
      wording: 'ENTRIES OPENING SOON',
    });
    expect(readOrganiser(answerOf('london-t100-2026'))).toEqual({ status: 'sold-out', wording: 'ENTRIES SOLD OUT' });
    expect(readOrganiser(answerOf('london-t100-2025'))).toEqual({
      status: 'waitlist',
      wording: 'SOLD OUT – JOIN WAIT LIST',
    });
    expect(readOrganiser('{"status":"live"}')).toEqual({ status: 'open', wording: 'live' });
  });

  it('refuses a Cloudflare page, an unknown status or an odd shape', () => {
    expect(readOrganiser('<!DOCTYPE html><title>Just a moment...</title>')).toEqual({
      error: 'the answer is not JSON (a Cloudflare page?)',
    });
    expect(readOrganiser('{"status":"paused"}')).toEqual({ error: 'unknown status "paused"' });
    expect(readOrganiser('[]')).toEqual({ error: 'the answer is not an object' });
    expect(readOrganiser('null')).toEqual({ error: 'the answer is not an object' });
  });

  it('is asked with the competition and edition ids from the entry platform', () => {
    const london = platform('london-t100-2027');
    expect([london.competitionId, london.editionId]).toEqual([
      answers['london-t100-2027']!.competition_id,
      answers['london-t100-2027']!.edition_id,
    ]);
    expect(t100OrganiserUrl(london.competitionId!, london.editionId!)).toBe(
      `${T100_ORGANISER}?competition_id=6a608bdc19bef6bd5f15a545&edition_id=6a608bdc19bef6bd5f15a533`,
    );
  });
});

describe("readPlatform (the entry platform's explicit signals)", () => {
  it('says when entries open later, in the local time of the race', () => {
    expect(platform('london-t100-2027')).toMatchObject({
      status: 'opening-soon',
      opens: '2026-10-05', // 2026-10-04T23:01Z is just after midnight in London
      editionDate: '2027-08-22',
    });
    expect(platform('marbella-t100-2027')).toMatchObject({
      status: 'opening-soon',
      opens: '2026-10-07',
      signal: 'Entries open 2026-10-07',
    });
  });

  it('reads an unpublished edition as opening soon, without a date when its entry window is inconsistent', () => {
    const saudi = platform('saudi-arabia-t100-2026');
    expect(saudi).toMatchObject({
      status: 'opening-soon',
      editionStatus: 'DRAFT',
      signal: 'Edition not published yet',
    });
    expect(saudi.opens).toBeUndefined();
    // Published with the same window (it closes before it opens): no signal to go by, and never "closed".
    const published = { ...edition('saudi-arabia-t100-2026'), status: 'OPEN' };
    const r = readPlatform(published, 'saudi-arabia-t100-2026', NOW);
    expect('error' in r || r.status).toBeUndefined();
  });

  it('reads a held edition, or one whose entries closed, as closed', () => {
    expect(platform('london-t100-2026').status).toBe('closed');
    expect(platform('london-t100-2025').status).toBe('closed');
    // Once entries close (Dubai: 2026-11-09), before race day.
    expect(platform('dubai-t100-2026', new Date('2026-11-10T00:00:00Z')).status).toBe('closed');
    expect(readPlatform({ ...edition('dubai-t100-2026'), status: 'CLOSED' }, 'dubai-t100-2026', NOW)).toMatchObject({
      status: 'closed',
    });
  });

  it('cannot tell open from sold out: no status for a race on sale, whatever its entry counts', () => {
    expect(platform('dubai-t100-2026').status).toBeUndefined();
    expect(platform('qatar-t100-2026').status).toBeUndefined();
    expect(platform('gold-coast-t100-2027').status).toBeUndefined();
    // Dubai 2026: 875 reserved of 895 places. More reserved than places still says nothing
    // (London 2026 had 2397 reserved for 1750 places).
    const dubai = edition('dubai-t100-2026');
    const race = pickAgeGroup100k(dubai);
    if ('error' in race) throw new Error(race.error);
    const reserved = (race.competition.prices ?? []).reduce((s, p) => s + (p.reservedCount ?? 0), 0);
    expect([reserved, race.competition.place]).toEqual([875, '895']);
    race.competition.place = '100';
    expect(readPlatform(dubai, 'dubai-t100-2026', NOW)).not.toHaveProperty('status');
  });

  it('shows a waitlist when the race is in waiting-list mode', () => {
    const dubai = edition('dubai-t100-2026');
    const race = pickAgeGroup100k(dubai);
    if ('error' in race) throw new Error(race.error);
    race.competition.waitingListMode = true;
    expect(readPlatform(dubai, 'dubai-t100-2026', NOW)).toMatchObject({ status: 'waitlist' });
  });

  it("never contradicts what the organiser's site showed for the saved editions", () => {
    // The organiser keeps showing "sold out" / "wait list" after race day; for us entries are closed.
    const allowed: Record<string, (string | undefined)[]> = {
      open: [undefined],
      'opening-soon': ['opening-soon', undefined],
      'sold-out': ['closed', undefined],
      waitlist: ['waitlist', 'closed', undefined],
    };
    for (const slug of Object.keys(answers).filter((k) => !k.startsWith('_'))) {
      const organiser = readOrganiser(answerOf(slug));
      if ('error' in organiser) throw new Error(organiser.error);
      expect(allowed[organiser.status], slug).toContain(platform(slug).status);
    }
  });

  it('keeps the place limit while entries come in (one reason the counts are not used)', () => {
    const olympic = (e: NjukoEdition) => e.competitions!.find((c) => /Olympic/.test(c.reportName ?? ''))!;
    const before = olympic(edition('gold-coast-t100-2027.earlier'));
    const after = olympic(edition('gold-coast-t100-2027'));
    const sum = (c: typeof before) => (c.prices ?? []).reduce((s, p) => s + (p.reservedCount ?? 0), 0);
    expect([sum(before), sum(after)]).toEqual([308, 309]);
    expect([before.place, after.place]).toEqual(['1579', '1579']);
  });

  it('ignores race dates it cannot read', () => {
    const e = edition('dubai-t100-2026');
    const race = pickAgeGroup100k(e);
    if ('error' in race) throw new Error(race.error);
    race.competition.startDate = 'soon';
    // Falls back to the edition's start (20:00 UTC on 14 Nov is 15 Nov in Dubai).
    expect(readPlatform(e, 'dubai-t100-2026', NOW)).toMatchObject({ editionDate: '2026-11-15' });
    e.startDate = null;
    expect(readPlatform(e, 'dubai-t100-2026', NOW)).toMatchObject({ editionDate: '2026' });
  });

  it('refuses an edition status it does not know', () => {
    expect(readPlatform({ ...edition('dubai-t100-2026'), status: 'PAUSED' }, 'dubai-t100-2026', NOW)).toEqual({
      error: 'unknown edition status "PAUSED"',
    });
  });
});

describe('localDay', () => {
  it('converts to the edition time zone, and falls back to the UTC day', () => {
    expect(localDay('2027-03-20T22:00:00.000Z', 'AUS Eastern Standard Time')).toBe('2027-03-21');
    expect(localDay('2027-08-15T15:00:00.000Z', 'Pacific Standard Time')).toBe('2027-08-15');
    expect(localDay('2027-08-15T15:00:00.000Z', 'Europe/Paris')).toBe('2027-08-15');
    expect(localDay('2027-03-20T22:00:00.000Z', 'Mars Standard Time')).toBe('2027-03-20');
    expect(localDay('2027-03-20T22:00:00.000Z', null)).toBe('2027-03-20');
  });
});

describe('refreshT100', () => {
  const t100 = (id: string, date: string) =>
    makeRecord({
      id,
      brand: 't100',
      distance: 't100',
      series: 'T100 World Championship Tour',
      country: 'AE',
      lat: 25.2,
      lng: 55.27,
      editions: [{ date, status: 'confirmed' }],
    });
  const races = deriveRaces(
    [
      t100('t100-dubai-t100', '2026-11-15'),
      t100('t100-london-t100', '2027-08-22'),
      t100('t100-qatar-t100', '2026-12-12'),
      t100('t100-wanaka-t100', '2027-02-20'),
    ],
    TODAY,
  );
  const sources = {
    't100-dubai-t100': 'dubai-t100',
    't100-london-t100': 'london-t100',
    't100-qatar-t100': 'qatar-t100',
  };
  const ok = (text: string): HttpResponse => ({ status: 200, text });
  const platformOk = (slug: string) => ok(registrationSample(`t100/${slug}.json`));
  const ALL = ['dubai-t100-2026', 'london-t100-2027', 'qatar-t100-2026'];
  /**
   * Serves the entry platform (by slug) and t100triathlon.com (by competition id). An
   * answer may be an Error to throw; a missing one is a 404.
   */
  const served = (
    platformAnswers: Record<string, HttpResponse | Error>,
    organiserAnswers: Record<string, HttpResponse | Error> = {},
  ): Fetcher & { urls: string[] } => {
    const urls: string[] = [];
    const bySlug = Object.fromEntries(
      Object.entries(answers).flatMap(([slug, a]) => (a.competition_id ? [[a.competition_id, slug]] : [])),
    );
    const f = async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      const a = url.startsWith(T100_ORGANISER)
        ? organiserAnswers[bySlug[u.searchParams.get('competition_id') ?? ''] ?? '']
        : platformAnswers[decodeURIComponent(u.pathname.split('/').pop()!)];
      if (a instanceof Error) throw a;
      return a ?? { status: 404, text: '{"statusCode":404}' };
    };
    return Object.assign(f, { urls });
  };
  const organiserOk = (slugs: string[]) => Object.fromEntries(slugs.map((s) => [s, ok(answerOf(s))]));
  const platformAll = Object.fromEntries(ALL.map((s) => [s, platformOk(s)]));
  const blocked: HttpResponse = { status: 403, text: '<!DOCTYPE html><title>Attention Required! | Cloudflare</title>' };
  const previous: RegistrationFile = {
    source: 'https://front-api.registrations.protriathletes.org/edition/url/',
    checkedAt: '2026-09-20T05:00:00.000Z',
    races: {
      't100-dubai-t100': {
        status: 'open',
        label: 'REGISTER NOW · Triathlon - 100km - Individual',
        method: 'organiser',
        editionDate: '2026-11-16',
      },
      // About last year's edition: never kept for this one.
      't100-qatar-t100': {
        status: 'sold-out',
        label: 'ENTRIES SOLD OUT · Triathlon - 100km - Individual',
        method: 'organiser',
        editionDate: '2025-12-14',
      },
    },
  };
  const run = (fetcher: Fetcher, prev: RegistrationFile | undefined = previous) =>
    refreshT100({ fetcher, races, sources, previous: prev, now: NOW, today: TODAY });

  it("asks the platform for each mapped race's next edition, then the organiser for its 100 km race", async () => {
    expect(t100ApiUrl('london-t100-2027')).toBe(
      'https://front-api.registrations.protriathletes.org/edition/url/london-t100-2027',
    );
    const fetcher = served(platformAll, organiserOk(ALL));
    const r = await run(fetcher);
    expect(r.ok).toBe(true);
    expect(fetcher.urls).toHaveLength(6);
    expect(fetcher.urls.filter((u) => u.startsWith(T100_ORGANISER))).toHaveLength(3);
    expect(r.file!.races).toEqual({
      't100-dubai-t100': {
        status: 'open',
        label: 'REGISTER NOW · Triathlon - 100km - Individual',
        method: 'organiser',
        editionDate: '2026-11-16', // 05:00 UTC is 09:00 in Dubai
        url: 'https://in.registrations.protriathletes.org/dubai-t100-2026',
      },
      't100-london-t100': {
        status: 'opening-soon',
        label: 'ENTRIES OPENING SOON · Triathlon - 100km - Individual',
        method: 'organiser',
        editionDate: '2027-08-22',
        url: 'https://in.registrations.protriathletes.org/london-t100-2027',
        opens: '2026-10-05',
      },
      't100-qatar-t100': {
        status: 'open',
        label: 'REGISTER NOW · Triathlon - 100km - Individual',
        method: 'organiser',
        editionDate: '2026-12-13',
        url: 'https://in.registrations.protriathletes.org/qatar-t100-2026',
      },
    });
    expect(r.file!.checkedAt).toBe('2026-09-26T06:00:00.000Z');
    expect(r.unmapped.map((x) => x.id)).toEqual(['t100-wanaka-t100']);
    expect(t100Summary(r)).toMatch(/t100triathlon\.com gave the status of 3 of 3 races\./);
  });

  it('takes a "sold out" from the organiser, never from the entry counts', async () => {
    const r = await run(
      served(platformAll, {
        ...organiserOk(ALL),
        'dubai-t100-2026': ok('{"status":"sold_out","message":"ENTRIES SOLD OUT"}'),
      }),
    );
    expect(r.file!.races['t100-dubai-t100']).toMatchObject({ status: 'sold-out', method: 'organiser' });
  });

  it("falls back to the platform's explicit signals when the organiser's site is blocked", async () => {
    const r = await run(
      served(platformAll, { 'dubai-t100-2026': blocked, 'london-t100-2027': blocked, 'qatar-t100-2026': blocked }),
    );
    expect(r.ok).toBe(true);
    // London: entries open on 5 Oct, which the platform says for sure.
    expect(r.file!.races['t100-london-t100']).toEqual({
      status: 'opening-soon',
      // The setting that gave the status, not the edition's "OPEN", which contradicts it.
      label: 'Entries open 2026-10-05 · Triathlon - 100km - Individual',
      method: 'platform',
      editionDate: '2027-08-22',
      url: 'https://in.registrations.protriathletes.org/london-t100-2027',
      opens: '2026-10-05',
    });
    // Dubai: on sale or sold out, the platform cannot tell: the previous status for this
    // edition is kept with its own date, so the app still ages it out.
    expect(r.file!.races['t100-dubai-t100']).toEqual({
      ...previous.races['t100-dubai-t100'],
      checkedAt: '2026-09-20T05:00:00.000Z',
    });
    // Qatar: the previous status is about another edition, so none.
    expect(r.file!.races['t100-qatar-t100']).toBeUndefined();
    expect(r.results.map((x) => [x.raceId, x.outcome, x.carriedOver ?? false])).toEqual([
      ['t100-dubai-t100', 'unknown', true],
      ['t100-london-t100', 'platform', false],
      ['t100-qatar-t100', 'unknown', false],
    ]);
    expect(r.results.every((x) => x.organiserError === 'HTTP 403')).toBe(true);
    const summary = t100Summary(r);
    expect(summary).toMatch(/t100triathlon\.com gave the status of 0 of 3 races; the others use the entry platform/);
    expect(summary).toMatch(/kept the previous status \(checked 2026-09-20T05:00:00\.000Z\)/);
  });

  it('falls back the same way when the organiser request fails or answers something unknown', async () => {
    const r = await run(
      served(platformAll, {
        'dubai-t100-2026': new Error('the time budget of this run is used up'),
        'london-t100-2027': { status: 500, text: '' },
        'qatar-t100-2026': ok('{"status":"paused"}'),
      }),
    );
    expect(r.results.map((x) => x.organiserError)).toEqual([
      'request failed (the time budget of this run is used up)',
      'HTTP 500',
      'unknown status "paused"',
    ]);
    expect(r.results.map((x) => x.entry?.method)).toEqual(['organiser', 'platform', undefined]);
  });

  it('a failed platform request keeps the previous status for the same edition; a missing edition has none', async () => {
    const r = await run(
      served(
        {
          'dubai-t100-2026': { status: 502, text: 'Bad gateway' },
          'london-t100-2027': platformOk('london-t100-2027'),
          'qatar-t100-2026': platformOk('qatar-t100-2026'),
        },
        organiserOk(ALL),
      ),
    );
    expect(r.ok).toBe(true);
    expect(r.results[0]).toMatchObject({ outcome: 'failed', detail: 'HTTP 502', carriedOver: true });
    expect(r.file!.races['t100-dubai-t100']?.checkedAt).toBe('2026-09-20T05:00:00.000Z');
    expect(t100Summary(r)).toMatch(/failed: HTTP 502 · kept the previous status/);

    const gone = await run(served({ 'dubai-t100-2026': platformOk('dubai-t100-2026') }, organiserOk(ALL)));
    expect(gone.results.find((x) => x.raceId === 't100-qatar-t100')).toMatchObject({ outcome: 'no-edition' });
    expect(gone.file!.races['t100-qatar-t100']).toBeUndefined();
  });

  it('gives no status, and does not crash, on a platform answer in an unknown shape', async () => {
    const r = await run(
      served(
        {
          'dubai-t100-2026': platformOk('dubai-t100-2026'),
          'london-t100-2027': ok('{"status":"OPEN","competitions":{"a":1}}'),
          'qatar-t100-2026': ok('null'),
        },
        organiserOk(ALL),
      ),
    );
    expect(r.ok).toBe(true);
    expect(r.results.map((x) => x.outcome)).toEqual(['organiser', 'unusable', 'unusable']);
    expect(Object.keys(r.file!.races)).toEqual(['t100-dubai-t100']);
  });

  it('refuses to write when most platform requests fail or nothing could be read', async () => {
    const down = await run(
      served({
        'dubai-t100-2026': new Error('ETIMEDOUT'),
        'london-t100-2027': { status: 500, text: '' },
        'qatar-t100-2026': platformOk('qatar-t100-2026'),
      }),
    );
    expect(down).toMatchObject({ ok: false, error: expect.stringMatching(/only 1 of 3 requests were answered/) });
    expect(down.file).toBeUndefined();
    const nothing = await run(served({}));
    expect(nothing).toMatchObject({ ok: false, error: expect.stringMatching(/0 editions read/) });
  });
});

describe('T100 limits in CI', () => {
  it('end well within the 5-minute step, even when the last request is rate limited and slow', () => {
    const { timeoutMs, retries, defaultWaitMs, maxWaitMs, maxTotalWaitMs, runMs } = T100_LIMITS;
    expect(retries * maxWaitMs).toBeLessThanOrEqual(maxTotalWaitMs);
    // A 429 without Retry-After is still retried once (a default above the cap would give up at once).
    expect(defaultWaitMs).toBeLessThanOrEqual(maxWaitMs);
    // The last request may start just before the deadline, wait once and be retried.
    expect(runMs + (retries + 1) * timeoutMs + retries * maxWaitMs).toBeLessThan(5 * 60_000 - 30_000);
  });
});
