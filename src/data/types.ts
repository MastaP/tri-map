import type { RegionId } from './regions.ts';
import type { EntryType } from './constants.ts';
import type { RaceRecord } from './schema.ts';
import type { NextEdition } from './nextEdition.ts';

/** A race record plus fields derived at load time. */
export interface Race extends RaceRecord {
  /** How age-groupers get a start; the data default ("open") is filled in. */
  entry: EntryType;
  region: RegionId;
  countryName: string;
  flag: string;
  /**
   * The next edition, or null when there is none to enter: every edition cancelled, or
   * a race that does not recur (`recurring: false` / `continuedAs`) and has no upcoming
   * edition. Such races are left out of results but still open from a deep link.
   */
  nextEdition: NextEdition | null;
  /**
   * Every edition still to come, in date order: known ones, then yearly estimates up to
   * the end of next year. `nextEdition` is the first. A time filter matches a race when
   * any of these falls in the range.
   */
  upcoming: NextEdition[];
  /** Ids of the races this one replaces (the reverse of their `continuedAs`), in data order. */
  formerly: string[];
  /** Normalized text used by the free-text search (name, city, country, series, former names). */
  searchText: string;
}
