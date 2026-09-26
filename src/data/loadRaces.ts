/**
 * The race data, validated at build time and bundled into the app by the
 * `virtual:trimap-races` module (see vite.config.ts), then derived for `today`: region,
 * country name, flag, upcoming editions, and the registration status from
 * `virtual:trimap-registration` (data/registration).
 *
 * `VITE_RACE_DATA=fixtures` (or `--mode fixtures`) swaps in the small deterministic data
 * set from tests/fixtures/races for local development and e2e tests.
 */
import records from 'virtual:trimap-races';
import registration from 'virtual:trimap-registration';
import type { ISODate } from '../lib/dates.ts';
import { deriveRaces } from './derive.ts';
import { registrationSources, type RegistrationSourceSummary } from './registration.ts';
import type { Race } from './types.ts';

let cache: { today: ISODate; races: Race[] } | null = null;

/** Every race, with the registration status of its next edition when a recent one is known. */
export function loadRaces(today: ISODate): Race[] {
  if (cache?.today !== today) cache = { today, races: deriveRaces(records, today, registration) };
  return cache.races;
}

/** Which registration sources are bundled, when each was checked and whether it is still shown. */
export function loadRegistrationSources(today: ISODate): RegistrationSourceSummary[] {
  return registrationSources(registration, today);
}
