import { describe, expect, it } from 'vitest';
import { deriveRaces } from '../../src/data/derive.ts';
import { retryWhenRateLimited, withDeadline, type Fetcher } from '../../scripts/registration/common.ts';
import {
  htmlText,
  ironmanStatus,
  ironmanSummary,
  isBlockPage,
  isFlex90,
  matchIronmanCards,
  normalizeRaceUrl,
  parseCardDate,
  parseIronmanPage,
  refreshIronman,
  registerPageUrl,
} from '../../scripts/registration/ironman.ts';
import { makeRecord, registrationSample, TODAY, inTimeZone } from './helpers.ts';

inTimeZone('UTC');

const page = (n: number) => registrationSample(`ironman/races-page-${n}.html`);

/** TriMap races for the cards in the fixture pages, by race-page slug and date. */
const race = (id: string, slug: string, date: string, extra: Record<string, unknown> = {}) =>
  makeRecord({
    id,
    brand: 'ironman',
    distance: id.endsWith('-half') ? 'half' : 'full',
    series: id.endsWith('-half') ? 'IRONMAN 70.3' : 'IRONMAN',
    url: `https://www.ironman.com/races/${slug}`,
    editions: [{ date, status: 'confirmed' }],
    ...extra,
  });
const races = deriveRaces(
  [
    race('ironman-nice-world-championship-half', 'im703-world-championship-2026', '2026-09-12', {
      entry: 'qualification',
      recurring: false,
    }),
    race('ironman-jones-beach-half', 'im703-new-york', '2026-09-26'),
    race('ironman-augusta-ga-half', 'im703-augusta', '2026-09-27'),
    race('ironman-chattanooga-full', 'im-chattanooga/', '2026-09-27'), // trailing slash in our data
    race('ironman-gurye-full', 'IM-Gurye', '2026-10-04'), // other case in our data
    race('ironman-calella-barcelona-full', 'im-barcelona', '2026-10-04'),
    race('ironman-waco-half', 'im703-waco', '2026-10-04'),
    race('ironman-kona-full', 'im-world-championship-kona', '2026-10-10', { entry: 'qualification' }),
    race('ironman-encarnacion-half', 'im703-encarnacion', '2026-10-11'),
    race('ironman-san-juan-half', 'im703-san-juan', '2027-04-11'),
    race('ironman-leeds-full', 'im-leeds', '2027-08-15'),
    race('ironman-nowhere-full', 'im-nowhere', '2027-06-01'),
  ],
  TODAY,
);

describe('parseIronmanPage', () => {
  it('reads each race card: race page, name, status tag and date', () => {
    const cards = parseIronmanPage(page(0));
    expect(cards).toHaveLength(7);
    expect(cards[0]).toEqual({
      url: 'https://www.ironman.com/races/im703-world-championship-2026',
      title: 'IRONMAN 70.3 World Championship',
      label: 'Closed',
      dateText: 'September 12–13, 2026',
    });
    expect(cards.map((c) => c.label)).toEqual([
      'Closed',
      'Registration Closed',
      'Race Weekend',
      'Race Weekend',
      'Registration Sold Out',
      'Registration Sold Out',
      'General Registration Sold Out',
    ]);
    // The footer's "Your Privacy Choices" (class privacy-choice-tag) is not a card tag.
    expect(cards.some((c) => /privacy/i.test(c.label ?? ''))).toBe(false);
    expect(parseIronmanPage(page(1)).map((c) => [c.label, c.url.split('/').pop()])).toEqual([
      ['By Qualification Only', 'im-world-championship-kona'],
      ['Registration Sold Out', '5150-coquimbo'],
      ['Registration Now Open', 'im703-encarnacion'],
      ['Registration Opening Soon', 'im703-san-juan'],
      ['Flex90 Eligible', 'im-leeds'],
    ]);
  });

  it('finds no cards on the page after the last', () => {
    expect(parseIronmanPage(page(2))).toEqual([]);
  });

  it('decodes entities and strips tags', () => {
    expect(htmlText(' IRONMAN 70.3 Coeur d&#039;Alene <em>x</em>&amp; more ')).toBe(
      "IRONMAN 70.3 Coeur d'Alene x & more",
    );
  });

  it('recognises a Cloudflare challenge page, but not the real listing', () => {
    expect(isBlockPage(registrationSample('ironman/block-page.html'))).toBe(true);
    expect(isBlockPage(page(0))).toBe(false);
  });
});

describe('IRONMAN status tags', () => {
  it('maps every tag the race finder uses', () => {
    expect(ironmanStatus('Registration Now Open')).toBe('open');
    expect(ironmanStatus('Flex90 Eligible')).toBe('open');
    expect(ironmanStatus('Registration Opening Soon')).toBe('opening-soon');
    expect(ironmanStatus('Registration Sold Out')).toBe('sold-out');
    expect(ironmanStatus('Sold Out')).toBe('sold-out');
    expect(ironmanStatus('General Registration Sold Out')).toBe('general-sold-out');
    expect(ironmanStatus('Registration Closed')).toBe('closed');
    expect(ironmanStatus('Closed')).toBe('closed');
    expect(ironmanStatus('Race Weekend')).toBe('closed');
    expect(ironmanStatus('  registration   SOLD out ')).toBe('sold-out');
    expect(ironmanStatus('By Qualification Only')).toBe('skip');
    expect(ironmanStatus('Pre-sale')).toBeNull();
    expect(isFlex90(' Flex90  eligible')).toBe(true);
    expect(isFlex90('Registration Now Open')).toBe(false);
  });

  it("finds a race's registration page", () => {
    expect(registerPageUrl('https://www.ironman.com/races/im703-nice')).toBe(
      'https://www.ironman.com/races/im703-nice/register',
    );
    expect(registerPageUrl('http://www.ironman.com/races/im703-nice/?x=1#y')).toBe(
      'https://www.ironman.com/races/im703-nice/register',
    );
  });

  it('reads card dates, ranges and odd formats', () => {
    expect(parseCardDate('October 4, 2026')).toBe('2026-10-04');
    expect(parseCardDate('September 12–13, 2026')).toBe('2026-09-12');
    expect(parseCardDate('August 31 – September 1, 2027')).toBe('2027-08-31');
    expect(parseCardDate('Sept. 5, 2027')).toBe('2027-09-05');
    expect(parseCardDate('July 24th, 2027')).toBe('2027-07-24'); // registration pages
    expect(parseCardDate('August 1st, 2027')).toBe('2027-08-01');
    expect(parseCardDate('February 30, 2027')).toBe('2027');
    expect(parseCardDate('Summer 2027')).toBe('2027');
    expect(parseCardDate('TBA')).toBeUndefined();
    expect(parseCardDate(null)).toBeUndefined();
  });

  it('matches race pages however the url is written', () => {
    expect(normalizeRaceUrl('https://www.ironman.com/races/IM-Gurye/')).toBe('ironman.com/races/im-gurye');
    expect(normalizeRaceUrl('http://ironman.com/races/im-gurye?x=1#y')).toBe('ironman.com/races/im-gurye');
    expect(normalizeRaceUrl('/races/im-gurye')).toBe('ironman.com/races/im-gurye');
    // A different page of the same race is a different url (the results page of a replaced race).
    expect(normalizeRaceUrl('https://www.ironman.com/races/im-philippines/results')).not.toBe(
      normalizeRaceUrl('https://www.ironman.com/races/im-philippines'),
    );
  });
});

describe('matchIronmanCards', () => {
  const cards = [...parseIronmanPage(page(0)), ...parseIronmanPage(page(1))];
  const m = matchIronmanCards(cards, races);

  it('writes a status per matched race, with the card date as the edition', () => {
    expect(m.entries['ironman-gurye-full']).toEqual({
      status: 'sold-out',
      label: 'Registration Sold Out',
      method: 'finder',
      editionDate: '2026-10-04',
      url: 'https://www.ironman.com/races/im-gurye',
    });
    expect(m.entries['ironman-chattanooga-full']?.status).toBe('closed');
    expect(m.entries['ironman-waco-half']?.status).toBe('general-sold-out');
    expect(m.entries['ironman-leeds-full']).toMatchObject({ status: 'open', label: 'Flex90 Eligible' });
    expect(Object.keys(m.entries)).toHaveLength(10);
  });

  it('reports what it could not use', () => {
    expect(m.ignored.map((c) => c.title)).toEqual(['5150 Coquimbo']);
    expect(m.skipped.map((s) => s.raceIds)).toEqual([['ironman-kona-full']]);
    expect(m.unmatched).toEqual([]);
    expect(m.withoutCard.map((r) => r.id)).toEqual(['ironman-nowhere-full']);
    // The 70.3 World Championship was held: its "Closed" is about a past edition.
    expect(m.otherEdition.map((o) => o.race.id)).toEqual(['ironman-nice-world-championship-half']);
  });

  it('lists cards without a race and keeps the first card of a race', () => {
    const extra = { ...cards[4]!, url: 'https://www.ironman.com/races/im-somewhere-new' };
    const again = { ...cards[4]!, label: 'Registration Now Open' };
    const r = matchIronmanCards([...cards, extra, again], races);
    expect(r.unmatched.map((c) => c.url)).toEqual(['https://www.ironman.com/races/im-somewhere-new']);
    expect(r.duplicates).toHaveLength(1);
    expect(r.entries['ironman-gurye-full']?.status).toBe('sold-out');
  });
});

describe('refreshIronman', () => {
  const now = new Date('2026-09-25T08:00:00.000Z');
  const ok = (text: string) => ({ status: 200, text });
  const notFound = { status: 404, text: 'Not found' };
  /** Leeds (card: "Flex90 Eligible", 15 Aug 2027): a saved registration page given Leeds's date. */
  const leedsPage = (name: string, date: string) =>
    ok(registrationSample(`ironman/${name}.html`).replace(date, 'August 15th, 2027'));
  /** Serves the finder pages (by ?page=) and race or registration pages (by path; else 404). */
  const served = (
    pages: Record<number, { status: number; text: string }>,
    other: Record<string, { status: number; text: string } | Error> = {},
  ): Fetcher & { urls: string[] } => {
    const urls: string[] = [];
    const f = async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      if (u.pathname === '/races') return pages[Number(u.searchParams.get('page'))] ?? ok(page(2));
      const answer = other[u.pathname] ?? notFound;
      if (answer instanceof Error) throw answer;
      return answer;
    };
    return Object.assign(f, { urls });
  };
  const finder = { 0: ok(page(0)), 1: ok(page(1)) };

  it('walks the finder pages, checks the Flex90 card on its registration page and builds the file', async () => {
    const fetcher = served(finder, {
      '/races/im-leeds/register': leedsPage('register-special-nice', 'September 12th, 2027'),
    });
    const r = await refreshIronman({ fetcher, races, now, today: TODAY });
    expect(r.ok).toBe(true);
    expect(fetcher.urls).toEqual([
      ...[0, 1, 2].map((n) => `https://www.ironman.com/races?page=${n}`),
      // ironman-nowhere-full: an announced edition and no card, so its race page (404 here).
      'https://www.ironman.com/races/im-nowhere',
      'https://www.ironman.com/races/im-leeds/register',
    ]);
    expect(r.file).toMatchObject({ source: 'https://www.ironman.com/races', checkedAt: '2026-09-25T08:00:00.000Z' });
    expect(Object.keys(r.file!.races)).toEqual(Object.keys(r.file!.races).sort());
    // "Flex90 Eligible" on the card, general entry sold out on the registration page.
    expect(r.file!.races['ironman-leeds-full']).toEqual({
      status: 'general-sold-out',
      label: 'General entry: SOLD OUT · Sold Out | Special Entries Available',
      method: 'register-page',
      editionDate: '2027-08-15',
      url: 'https://www.ironman.com/races/im-leeds/register',
    });
    expect(r.file!.races['ironman-gurye-full']?.method).toBe('finder');
    const summary = ironmanSummary(r);
    expect(summary).toMatch(
      /10 TriMap races with a status: 1 open, 1 opening-soon, 2 sold-out, 2 general-sold-out, 4 closed/,
    );
    expect(summary).toMatch(/1 "Flex90 Eligible" cards checked on their registration page: 1 general-sold-out\./);
    expect(summary).toMatch(/ironman-nowhere-full: no status: HTTP 404/);
  });

  it('keeps "open" only when the registration page shows a general-entry price', async () => {
    const r = await refreshIronman({
      fetcher: served(finder, { '/races/im-leeds/register': leedsPage('register-open-boise', 'July 24th, 2027') }),
      races,
      now,
      today: TODAY,
    });
    expect(r.file!.races['ironman-leeds-full']).toMatchObject({
      status: 'open',
      label: 'General entry: $492.39 USD',
      method: 'register-page',
    });
    const soldOut = await refreshIronman({
      fetcher: served(finder, { '/races/im-leeds/register': leedsPage('register-sold-out', 'July 18th, 2027') }),
      races,
      now,
      today: TODAY,
    });
    expect(soldOut.file!.races['ironman-leeds-full']).toMatchObject({ status: 'sold-out', method: 'register-page' });
  });

  it('gives a Flex90 race no status when its registration page is missing, unclear or about another edition', async () => {
    const cases = {
      missing: notFound,
      unclear: ok(registrationSample('ironman/register-open-boise.html').replaceAll('coh-style-hidden', '')),
      // Boise's page, dated 24 Jul 2027: not Leeds's 15 Aug 2027 edition.
      otherEdition: ok(registrationSample('ironman/register-open-boise.html')),
      failed: new Error('ECONNRESET'),
    };
    const reasons: string[] = [];
    for (const answer of Object.values(cases)) {
      const r = await refreshIronman({
        fetcher: served(finder, { '/races/im-leeds/register': answer }),
        races,
        now,
        today: TODAY,
      });
      expect(r.ok).toBe(true);
      expect(r.file!.races['ironman-leeds-full']).toBeUndefined();
      reasons.push(r.checks.find((c) => c.kind === 'register-page')!.reason!);
    }
    expect(reasons).toEqual([
      'HTTP 404',
      'general entry shows "OPENING SOON"',
      'the page is about 2027-07-24, the card about 2027-08-15',
      'request failed (ECONNRESET)',
    ]);
  });

  it('reads the race page of an announced race without a card, only for the edition it is about', async () => {
    const wisconsin = (id: string, date: string) =>
      race(id, 'im-wisconsin', date, {
        editions: [
          { date: '2026-09-13', status: 'confirmed' },
          { date, status: 'confirmed' },
        ],
      });
    const extra = deriveRaces(
      [
        wisconsin('ironman-madison-full', '2027-09-12'),
        race('ironman-warsaw-half', 'im703-warsaw', '2026-06-07'), // estimated next edition only: not requested
      ],
      TODAY,
    );
    const fetcher = served(finder, {
      '/races/im-wisconsin': ok(registrationSample('ironman/race-page-wisconsin.html')),
      '/races/im-leeds/register': leedsPage('register-open-boise', 'July 24th, 2027'),
    });
    const r = await refreshIronman({ fetcher, races: [...races, ...extra], now, today: TODAY });
    expect(r.file!.races['ironman-madison-full']).toEqual({
      status: 'opening-soon',
      label: 'Registration Opening Soon',
      method: 'race-page',
      editionDate: '2027-09-12',
      url: 'https://www.ironman.com/races/im-wisconsin',
    });
    expect(fetcher.urls).not.toContain('https://www.ironman.com/races/im703-warsaw');
    expect(ironmanSummary(r)).toMatch(/ironman-madison-full: opening-soon \(Registration Opening Soon\)/);

    // The same page, but data/races says 2028: the page's 2027 status is not about that edition.
    const later = deriveRaces([wisconsin('ironman-madison-full', '2028-09-10')], TODAY);
    const wrong = await refreshIronman({
      fetcher: served(finder, { '/races/im-wisconsin': ok(registrationSample('ironman/race-page-wisconsin.html')) }),
      races: [...races, ...later],
      now,
      today: TODAY,
    });
    expect(wrong.file!.races['ironman-madison-full']).toBeUndefined();
    expect(wrong.checks.find((c) => c.url === 'https://www.ironman.com/races/im-wisconsin')!.reason).toBe(
      'the page\'s date "September 12, 2027" is not the next edition (2028-09-10)',
    );
  });

  it('stops requesting race and registration pages after a rate limit or a block', async () => {
    const fetcher = served(finder, {
      '/races/im-nowhere': { status: 429, text: '' },
      '/races/im-leeds/register': leedsPage('register-open-boise', 'July 24th, 2027'),
    });
    const r = await refreshIronman({ fetcher, races, now, today: TODAY });
    expect(r.ok).toBe(true);
    expect(fetcher.urls).not.toContain('https://www.ironman.com/races/im-leeds/register');
    expect(r.checks.map((c) => c.reason)).toEqual([
      'HTTP 429 (rate limited)',
      'not requested (rate limited earlier in this run)',
    ]);
    expect(r.file!.races['ironman-leeds-full']).toBeUndefined();
  });

  it('stops when a page only repeats cards it has seen', async () => {
    const fetcher = served({ ...finder, 2: ok(page(1)) });
    const r = await refreshIronman({ fetcher, races, now, today: TODAY });
    expect(r.ok).toBe(true);
    expect(fetcher.urls.filter((u) => u.includes('?page='))).toHaveLength(3);
  });

  it('refuses to write on an HTTP error, a rate limit or a block page in the finder', async () => {
    const blocked = await refreshIronman({
      fetcher: served({ 0: { status: 403, text: '' } }),
      races,
      now,
      today: TODAY,
    });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringMatching(/HTTP 403 \(blocked/) });
    const limited = await refreshIronman({
      fetcher: served({ 0: ok(page(0)), 1: { status: 429, text: '' } }),
      races,
      now,
      today: TODAY,
    });
    expect(limited).toMatchObject({ ok: false, error: expect.stringMatching(/page=1: HTTP 429 \(rate limited/) });
    expect(limited.file).toBeUndefined();
    const challenge = await refreshIronman({
      fetcher: served({ 0: ok(registrationSample('ironman/block-page.html')) }),
      races,
      now,
      today: TODAY,
    });
    expect(challenge).toMatchObject({ ok: false, error: expect.stringMatching(/blocked/) });
    const down = await refreshIronman({
      fetcher: async () => {
        throw new Error('ECONNRESET');
      },
      races,
      now,
      today: TODAY,
    });
    expect(down).toMatchObject({ ok: false, error: expect.stringMatching(/request failed \(ECONNRESET\)/) });
  });

  it('refuses to write when there are no cards or too few races got a status', async () => {
    const empty = await refreshIronman({ fetcher: served({ 0: ok(page(2)) }), races, now, today: TODAY });
    expect(empty).toMatchObject({ ok: false, error: expect.stringMatching(/no race cards/) });
    // Page 1 alone gives 2 of the 11 listed races a status (Leeds's registration page is missing): less than half.
    const few = await refreshIronman({ fetcher: served({ 0: ok(page(1)) }), races, now, today: TODAY });
    expect(few).toMatchObject({ ok: false, error: expect.stringMatching(/only 2 of 11 listed IRONMAN races/) });
    expect(few.file).toBeUndefined();
  });
});

describe('refreshIronman never writes a file that would not validate', () => {
  it('refuses when a matched race is not an IRONMAN race', async () => {
    // A Challenge race whose url points at an IRONMAN race page: its status would land in
    // ironman.json, which only holds IRONMAN races.
    const odd = deriveRaces(
      [
        makeRecord({
          id: 'challenge-gurye-full',
          brand: 'challenge',
          series: 'Challenge Family',
          url: 'https://www.ironman.com/races/im-gurye',
          editions: [{ date: '2026-10-04', status: 'confirmed' }],
        }),
      ],
      TODAY,
    );
    const pages: Record<number, string> = { 0: page(0), 1: page(1) };
    const r = await refreshIronman({
      fetcher: async (url) =>
        new URL(url).pathname === '/races'
          ? { status: 200, text: pages[Number(new URL(url).searchParams.get('page'))] ?? page(2) }
          : { status: 404, text: '' },
      races: [...races, ...odd],
      now: new Date('2026-09-25T08:00:00.000Z'),
      today: TODAY,
    });
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringMatching(/would not validate: challenge-gurye-full is a challenge race/),
    });
    expect(r.file).toBeUndefined();
  });

  it('stores race pages as https', () => {
    const html = page(0).replace(
      'href="https://www.ironman.com/races/im-gurye"',
      'href="http://www.ironman.com/races/im-gurye"',
    );
    expect(parseIronmanPage(html).find((c) => c.title === 'IRONMAN Gurye Korea')?.url).toBe(
      'https://www.ironman.com/races/im-gurye',
    );
  });
});

describe('retryWhenRateLimited', () => {
  it('waits as long as a 429 asks and tries again, a limited number of times', async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetcher = retryWhenRateLimited(
      async () => (++calls < 3 ? { status: 429, text: '', retryAfter: 30 } : { status: 200, text: 'ok' }),
      { wait: async (ms) => void waits.push(ms), onWait: () => {} },
    );
    expect(await fetcher('https://example.com')).toEqual({ status: 200, text: 'ok' });
    expect(waits).toEqual([30_000, 30_000]);

    const always = retryWhenRateLimited(async () => ({ status: 429, text: '' }), {
      retries: 1,
      wait: async (ms) => void waits.push(ms),
      onWait: () => {},
    });
    expect((await always('https://example.com')).status).toBe(429);
    expect(waits.at(-1)).toBe(60_000);
  });
});

describe('retryWhenRateLimited: a bounded budget', () => {
  const quiet = { onWait: () => {}, onGiveUp: () => {} };

  it('gives up instead of asking again sooner than the site said', async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetcher = retryWhenRateLimited(
      async () => (calls++, { status: 429, text: '', retryAfter: 600 }), // "come back in 10 minutes"
      { maxWaitMs: 30_000, wait: async (ms) => void waits.push(ms), ...quiet },
    );
    expect((await fetcher('https://example.com')).status).toBe(429);
    expect([calls, waits]).toEqual([1, []]);
  });

  it('shares one waiting budget across all the requests of a run', async () => {
    const waits: number[] = [];
    const fetcher = retryWhenRateLimited(async () => ({ status: 429, text: '', retryAfter: 20 }), {
      retries: 2,
      maxWaitMs: 30_000,
      maxTotalWaitMs: 60_000,
      wait: async (ms) => void waits.push(ms),
      ...quiet,
    });
    await fetcher('https://example.com/a'); // waits 20 s twice
    await fetcher('https://example.com/b'); // 20 s more reaches the budget; no more after that
    await fetcher('https://example.com/c');
    expect(waits).toEqual([20_000, 20_000, 20_000]);
  });
});

describe('withDeadline', () => {
  it('refuses new requests once the time budget of the run is used up', async () => {
    let t = 1_000;
    const fetcher = withDeadline(
      async () => ({ status: 200, text: 'ok' }),
      2_000,
      () => t,
    );
    expect((await fetcher('https://example.com')).text).toBe('ok');
    t = 2_000;
    await expect(fetcher('https://example.com')).rejects.toThrow(/time budget/);
  });
});
