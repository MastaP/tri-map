/**
 * Loads every data/races/*.json file at build time (bundled into the app), validates it
 * with zod and derives region, country name, flag and next edition.
 *
 * `VITE_RACE_DATA=fixtures` (or `--mode fixtures`) swaps in the small deterministic data
 * set from tests/fixtures/races for local development and e2e tests.
 */
import type { ISODate } from '../lib/dates.ts';
import { parseRaceFiles } from './parse.ts';
import type { Race } from './types.ts';

const modules: Record<string, unknown> =
  import.meta.env.VITE_RACE_DATA === 'fixtures'
    ? import.meta.glob('/tests/fixtures/races/*.json', { eager: true, import: 'default' })
    : import.meta.glob('/data/races/*.json', { eager: true, import: 'default' });

export const RACE_DATA_SOURCE = import.meta.env.VITE_RACE_DATA === 'fixtures' ? 'fixtures' : 'data';

let cache: { today: ISODate; races: Race[] } | null = null;

export function loadRaces(today: ISODate): Race[] {
  if (cache?.today !== today) cache = { today, races: parseRaceFiles(modules, today) };
  return cache.races;
}
