/**
 * The race data, validated at build time and bundled into the app by the
 * `virtual:trimap-races` module (see vite.config.ts), then derived for `today`: region,
 * country name, flag, upcoming editions.
 *
 * `VITE_RACE_DATA=fixtures` (or `--mode fixtures`) swaps in the small deterministic data
 * set from tests/fixtures/races for local development and e2e tests.
 */
import records from 'virtual:trimap-races';
import type { ISODate } from '../lib/dates.ts';
import { deriveRaces } from './derive.ts';
import type { Race } from './types.ts';

let cache: { today: ISODate; races: Race[] } | null = null;

export function loadRaces(today: ISODate): Race[] {
  if (cache?.today !== today) cache = { today, races: deriveRaces(records, today) };
  return cache.races;
}
