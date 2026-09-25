/**
 * "Nearest" sort: distance from the viewer (browser geolocation) or, when that is not
 * available, from the centre of the map. Pure and unit-tested.
 */
import type { Race } from '../data/types.ts';
import { haversineKm, type LngLat } from './geo.ts';

/** Where distances are measured from. */
export interface Origin extends LngLat {
  source: 'location' | 'map';
}

/** Distance in km from `origin` to every race, keyed by race id. */
export function distancesFrom(races: readonly Race[], origin: LngLat): Map<string, number> {
  return new Map(races.map((r) => [r.id, haversineKm(origin.lat, origin.lng, r.lat, r.lng)]));
}

/**
 * Nearest first. Races at the same spot (a full and a half on one weekend) keep the
 * order of `tieBreak`, which defaults to next date then name.
 */
export function sortByDistance(
  races: readonly Race[],
  origin: LngLat,
  tieBreak: (a: Race, b: Race) => number = byDateThenName,
): Race[] {
  const km = distancesFrom(races, origin);
  // Round to 100 m so floating-point noise between co-located races does not decide.
  const key = (r: Race) => Math.round(km.get(r.id)! * 10);
  return [...races].sort((a, b) => key(a) - key(b) || tieBreak(a, b));
}

/** By date (the next edition's unless `dateOf` says otherwise), then name, then distance. */
export function byDateThenName(
  a: Race,
  b: Race,
  dateOf: (r: Race) => string | undefined = (r) => r.nextEdition?.date,
): number {
  const da = dateOf(a);
  const db = dateOf(b);
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  }
  return a.name.localeCompare(b.name, 'en') || a.distance.localeCompare(b.distance);
}

/** "under 1 km away", "35 km away", "1,240 km away" (10 km steps beyond 100 km). */
export function formatDistanceAway(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return 'under 1 km away';
  const rounded = km < 100 ? Math.round(km) : Math.round(km / 10) * 10;
  return `${rounded.toLocaleString('en-US')} km away`;
}
