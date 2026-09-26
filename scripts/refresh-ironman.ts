/**
 * npm run refresh:ironman [-- --dry-run]
 *
 * Reads the registration status of every IRONMAN and IRONMAN 70.3 race from ironman.com
 * and writes data/registration/ironman.json (then commit and push it): the race finder's
 * status tags, the registration page of each race tagged "Flex90 Eligible" (whose general
 * entry may be sold out), and the race page of each race with an announced next edition
 * but no card. Run it by hand: ironman.com blocks GitHub-hosted runners, so CI never runs
 * this (it refuses to run in GitHub Actions).
 *
 * One request at a time, 2 s apart, with an honest User-Agent. Nothing is written
 * (exit 1, the committed file stays) on an HTTP error or block page in the finder, when no
 * cards are found, or when fewer than half of the listed IRONMAN races get a status.
 */
import { runIronmanRefresh } from './registration/run.ts';

process.exitCode = (await runIronmanRefresh({ dryRun: process.argv.includes('--dry-run') })) ? 0 : 1;
