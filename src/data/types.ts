import type { RegionId } from './regions.ts';
import type { RaceRecord } from './schema.ts';
import type { NextEdition } from './nextEdition.ts';

/** A race record plus fields derived at load time. */
export interface Race extends RaceRecord {
  region: RegionId;
  countryName: string;
  flag: string;
  nextEdition: NextEdition | null;
  /** Normalized text used by the free-text search (name, city, country, series). */
  searchText: string;
}
