/**
 * Derives the app model from validated race records: region, country, entry default,
 * upcoming editions, successor links and search text. Pure and free of zod, so the
 * browser can use it on data that was validated at build time.
 */
import type { ISODate } from '../lib/dates.ts';
import { COUNTRY_ALIASES, normalizeText } from '../lib/search.ts';
import { BRANDS } from './brands.ts';
import { upcomingEditions } from './nextEdition.ts';
import { getCountry, REGIONS } from './regions.ts';
import type { RaceRecord } from './schema.ts';
import type { Race } from './types.ts';

export class UnknownCountryError extends Error {}

function searchTextFor(record: RaceRecord, countryName: string, regionLabel: string): string {
  const parts = [
    record.name,
    record.city,
    countryName,
    ...(COUNTRY_ALIASES[record.country] ?? []),
    regionLabel,
    record.series ?? '',
    BRANDS[record.brand].label,
  ];
  if (record.brand === 'ironman') parts.push('im');
  // "70.3" is also typed as "703".
  if (/70\.3/.test(`${record.name} ${record.series ?? ''}`)) parts.push('703');
  return normalizeText(parts.join(' '));
}

export function deriveRace(record: RaceRecord, today: ISODate): Race {
  const country = getCountry(record.country);
  if (!country) throw new UnknownCountryError(`${record.id}: unknown country ${record.country}`);
  const upcoming = upcomingEditions(record.editions, today, {
    recurring: record.recurring !== false && record.continuedAs === undefined,
  });
  return {
    ...record,
    entry: record.entry ?? 'open',
    region: country.region,
    countryName: country.name,
    flag: country.flag,
    nextEdition: upcoming[0] ?? null,
    upcoming,
    formerly: [],
    searchText: searchTextFor(record, country.name, REGIONS[country.region].label),
  };
}

/**
 * Fill in the reverse of `continuedAs`: each race learns which races it replaces
 * (`formerly`), and their names become searchable on it, so looking up "Challenge
 * Wanaka" finds the T100 event that took over. Pure; returns new objects. Targets that
 * do not exist are ignored (validation reports them as errors).
 */
export function linkSuccessors(races: readonly Race[]): Race[] {
  const formerly = new Map<string, Race[]>();
  const ids = new Set(races.map((r) => r.id));
  for (const r of races) {
    if (r.continuedAs === undefined || !ids.has(r.continuedAs)) continue;
    const list = formerly.get(r.continuedAs) ?? [];
    list.push(r);
    formerly.set(r.continuedAs, list);
  }
  return races.map((r) => {
    const before = formerly.get(r.id);
    if (!before) return r;
    return {
      ...r,
      formerly: before.map((p) => p.id),
      searchText: `${r.searchText} ${normalizeText(before.map((p) => p.name).join(' '))}`,
    };
  });
}

/** Records that already passed validation → the app model. */
export function deriveRaces(records: readonly RaceRecord[], today: ISODate): Race[] {
  return linkSuccessors(records.map((r) => deriveRace(r, today)));
}
