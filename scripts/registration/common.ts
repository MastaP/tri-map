/**
 * Shared pieces of the registration refresh scripts (refresh-ironman.ts, refresh-t100.ts):
 * polite HTTP, the validated race data and the checks a new file must pass before it may
 * replace the committed one.
 */
import { deriveRaces } from '../../src/data/derive.ts';
import type { RegistrationEntry, RegistrationFile } from '../../src/data/registration.ts';
import { RaceFileSchema } from '../../src/data/schema.ts';
import type { Race } from '../../src/data/types.ts';
import { validateRaceFiles, type Issue } from '../../src/data/validate.ts';
import { validateRegistrationFiles } from '../../src/data/validateRegistration.ts';
import type { ISODate } from '../../src/lib/dates.ts';
import { dataDirFor, readRaceFiles } from '../raceFiles.ts';

/** An honest User-Agent that says who is asking and where to find us. */
export const USER_AGENT = 'TriMap/1.0 (+https://mastap.github.io/tri-map/)';

/** Pause between two requests: one request at a time, at least 2 s apart (ironman.com answers 429 when pushed). */
export const REQUEST_GAP_MS = 2000;

/**
 * A refresh that finds a status for fewer than this share of the races it should cover
 * is treated as broken (a changed page layout, a block page) and writes nothing.
 */
export const MIN_MATCH_SHARE = 0.5;

export interface HttpResponse {
  status: number;
  text: string;
  /** Seconds to wait before asking again (a 429's or 503's Retry-After header), when given. */
  retryAfter?: number;
}

/** Fetches one URL; the refresh scripts take it as a parameter so tests can serve fixtures. */
export type Fetcher = (url: string) => Promise<HttpResponse>;

export const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** GET with the TriMap User-Agent and a timeout. Network errors and timeouts throw; HTTP errors are returned. */
export function makeHttpGet(timeoutMs = 30_000): Fetcher {
  return async (url) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const retryAfter = Number(res.headers.get('retry-after'));
    return {
      status: res.status,
      text: await res.text(),
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
    };
  };
}

export const httpGet: Fetcher = makeHttpGet();

/** A fetcher that waits REQUEST_GAP_MS between requests (never two at once). */
export function politeFetcher(fetcher: Fetcher = httpGet, gapMs = REQUEST_GAP_MS): Fetcher {
  let last = 0;
  let queue: Promise<unknown> = Promise.resolve();
  return (url) => {
    const run = async () => {
      const wait = last + gapMs - Date.now();
      if (last && wait > 0) await sleep(wait);
      try {
        return await fetcher(url);
      } finally {
        last = Date.now();
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}

/**
 * A fetcher that, when the site says "too many requests" (HTTP 429), waits as long as it
 * asks (Retry-After, else `defaultWaitMs`) and asks again, up to `retries` times per
 * request. It never asks again sooner than the site said: when the site wants a longer
 * wait than `maxWaitMs`, or the waits of the whole run would exceed `maxTotalWaitMs`, it
 * gives up and returns the 429. Any other answer is returned as is.
 */
export function retryWhenRateLimited(
  fetcher: Fetcher,
  {
    retries = 2,
    defaultWaitMs = 60_000,
    maxWaitMs = 300_000,
    maxTotalWaitMs = Number.POSITIVE_INFINITY,
    wait = sleep,
    onWait = (ms: number, url: string) => console.log(`  … ${url}: HTTP 429, waiting ${Math.round(ms / 1000)} s`),
    onGiveUp = (ms: number, url: string) =>
      console.log(`  … ${url}: HTTP 429, and waiting ${Math.round(ms / 1000)} s is over the budget: giving up`),
  }: {
    retries?: number;
    defaultWaitMs?: number;
    maxWaitMs?: number;
    /** Budget for all the waits of this fetcher together (the whole run). */
    maxTotalWaitMs?: number;
    wait?: (ms: number) => Promise<void>;
    onWait?: (ms: number, url: string) => void;
    onGiveUp?: (ms: number, url: string) => void;
  } = {},
): Fetcher {
  let waited = 0;
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetcher(url);
      if (res.status !== 429 || attempt >= retries) return res;
      const ms = res.retryAfter !== undefined ? res.retryAfter * 1000 : defaultWaitMs;
      if (ms > maxWaitMs || waited + ms > maxTotalWaitMs) {
        onGiveUp(ms, url);
        return res;
      }
      waited += ms;
      onWait(ms, url);
      await wait(ms);
    }
  };
}

/**
 * A fetcher that refuses (throws) once `deadline` (a Date.now() value) has passed, so a
 * run that meets slow or failing servers ends in bounded time. A request already under
 * way is bounded by the HTTP timeout.
 */
export function withDeadline(fetcher: Fetcher, deadline: number, clock: () => number = Date.now): Fetcher {
  return async (url) => {
    if (clock() >= deadline) throw new Error('the time budget of this run is used up');
    return fetcher(url);
  };
}

/** The races in data/races (validated, as the app derives them for `today`). Throws on invalid data. */
export function loadRaces(today: ISODate, source?: string): Race[] {
  const files = readRaceFiles(dataDirFor(source));
  const result = validateRaceFiles(files, today);
  if (result.errorCount) {
    throw new Error(`data/races has ${result.errorCount} error(s); run \`npm run validate:data\` first.`);
  }
  return deriveRaces(
    files.flatMap((f) => RaceFileSchema.parse(JSON.parse(f.text))),
    today,
  );
}

/** Race entries with their ids sorted, so a refresh only changes the lines that changed. */
export function sortedEntries(entries: Record<string, RegistrationEntry>): Record<string, RegistrationEntry> {
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}

/** The errors a new registration file would raise in `npm run validate:data` (empty = safe to write). */
export function fileErrors(name: string, file: RegistrationFile, races: readonly Race[], today: ISODate): Issue[] {
  return validateRegistrationFiles([{ name, text: JSON.stringify(file) }], races, today).issues.filter(
    (i) => i.level === 'error',
  );
}

/** "12 open, 3 sold-out" style counts, in the order of `order`. */
export function countBy<T extends string>(values: readonly T[], order: readonly T[]): string {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return order
    .filter((k) => counts.has(k))
    .map((k) => `${counts.get(k)} ${k}`)
    .join(', ');
}
