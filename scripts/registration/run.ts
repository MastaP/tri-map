/**
 * The refresh commands (npm run refresh:ironman / refresh:t100 / refresh:registration):
 * load the races, fetch politely, print the summary, write the file only when the
 * refresh says it is safe. Each returns whether it succeeded; the scripts set the exit code.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistrationFile } from '../../src/data/registration.ts';
import { T100_SOURCES_FILE, validateRegistrationFiles } from '../../src/data/validateRegistration.ts';
import { localToday } from '../../src/lib/dates.ts';
import { readRegistrationFiles, registrationDirFor, writeJsonFile } from '../raceFiles.ts';
import { loadRaces, makeHttpGet, politeFetcher, REQUEST_GAP_MS, retryWhenRateLimited, withDeadline } from './common.ts';
import { ironmanSummary, refreshIronman } from './ironman.ts';
import { refreshT100, t100Summary } from './t100.ts';

/**
 * ironman.com, run by hand: at most 2 retries per request after a 429, each waiting what
 * the site asks up to 2 minutes, 5 minutes of such waiting in all.
 */
export const IRONMAN_LIMITS = { timeoutMs: 30_000, retries: 2, maxWaitMs: 120_000, maxTotalWaitMs: 300_000 };

/**
 * The T100 refresh runs in the deploy workflow (a 5-minute step): 20 s per request, one
 * retry after a 429 (after what the site asks, 20 s if it does not say, never more than
 * 30 s), 60 s of such waiting in all, and no new request after 3 minutes. What is not read by then keeps its previous status or has none.
 */
export const T100_LIMITS = {
  timeoutMs: 20_000,
  retries: 1,
  /** The wait after a 429 without Retry-After (within maxWaitMs, so the one retry happens). */
  defaultWaitMs: 20_000,
  maxWaitMs: 30_000,
  maxTotalWaitMs: 60_000,
  runMs: 180_000,
};

/** Whether this is a GitHub Actions run, where the IRONMAN refresh must not run. */
export const inGitHubActions = () => process.env.GITHUB_ACTIONS === 'true';

export async function runIronmanRefresh({ dryRun }: { dryRun: boolean }): Promise<boolean> {
  const target = join(registrationDirFor(undefined), 'ironman.json');
  if (inGitHubActions()) {
    console.error(
      '✖ The IRONMAN refresh runs by hand only: ironman.com blocks GitHub-hosted runners, and CI must not try to get round that.',
    );
    return false;
  }
  const today = localToday();
  const races = loadRaces(today);
  const { timeoutMs, ...retry } = IRONMAN_LIMITS;
  console.log(
    `Reading ironman.com (the race finder, then the registration page of each "Flex90 Eligible" race; one request every ${REQUEST_GAP_MS / 1000} s)…`,
  );
  const result = await refreshIronman({
    fetcher: retryWhenRateLimited(politeFetcher(makeHttpGet(timeoutMs)), retry),
    races,
    now: new Date(),
    today,
  });
  console.log(ironmanSummary(result));
  if (!result.ok || !result.file) {
    console.error(`\n✖ Not written: ${result.error}\n  ${target} is unchanged.`);
    return false;
  }
  if (dryRun) {
    console.log(`\n--dry-run: ${target} not written.`);
  } else {
    writeJsonFile(target, result.file);
    console.log(`\n✔ Wrote ${target} (checked ${result.file.checkedAt}). Commit and push it to publish.`);
  }
  return true;
}

export async function runT100Refresh({ dryRun }: { dryRun: boolean }): Promise<boolean> {
  const today = localToday();
  const races = loadRaces(today);
  const dir = registrationDirFor(undefined);
  const target = join(dir, 't100.json');

  const current = validateRegistrationFiles(readRegistrationFiles(dir), races, today);
  const sources = current.t100Sources;
  if (!existsSync(join(dir, T100_SOURCES_FILE)) || !sources) {
    const problems = current.issues.filter((i) => i.file === T100_SOURCES_FILE).map((i) => i.message);
    console.error(
      `✖ ${join(dir, T100_SOURCES_FILE)} is missing or invalid${problems.length ? `: ${problems.join('; ')}` : ''}`,
    );
    return false;
  }
  // A race whose status cannot be read now keeps its entry from the current (valid) file.
  const previous: RegistrationFile | undefined = current.data.t100;
  if (!previous && existsSync(target)) {
    console.warn(`! ${target} is invalid, so a race whose status cannot be read cannot keep its previous one.`);
  }

  const { timeoutMs, runMs, ...retry } = T100_LIMITS;
  console.log(
    `Reading the PTO entry platform and t100triathlon.com (one request every ${REQUEST_GAP_MS / 1000} s, at most ${runMs / 1000} s)…`,
  );
  const result = await refreshT100({
    fetcher: withDeadline(retryWhenRateLimited(politeFetcher(makeHttpGet(timeoutMs)), retry), Date.now() + runMs),
    races,
    sources,
    previous,
    now: new Date(),
    today,
  });
  console.log(t100Summary(result));
  if (!result.ok || !result.file) {
    console.error(`\n✖ Not written: ${result.error}\n  ${target} is unchanged.`);
    return false;
  }
  if (dryRun) {
    console.log(`\n--dry-run: ${target} not written.`);
  } else {
    writeJsonFile(target, result.file);
    console.log(`\n✔ Wrote ${target} (checked ${result.file.checkedAt}).`);
  }
  return true;
}
