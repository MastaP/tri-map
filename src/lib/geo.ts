/** [west, south, east, north]. `east` may exceed 180 when the box crosses the antimeridian. */
export type Bounds = readonly [number, number, number, number];

/** Is the point inside the bounds, taking longitude wrap-around into account? */
export function inBounds(lng: number, lat: number, [west, south, east, north]: Bounds): boolean {
  if (lat < south || lat > north) return false;
  if (east - west >= 360) return true;
  // Shift lng into [west, west + 360) and compare.
  const shifted = ((((lng - west) % 360) + 360) % 360) + west;
  return shifted <= east;
}

/**
 * Tightest bounds around the points. Longitudes are treated as circular so a set that
 * straddles the antimeridian (Fiji + Tahiti + New Zealand) yields a narrow box with
 * east > 180 instead of one that spans the whole globe.
 */
export function pointsBounds(points: ReadonlyArray<{ lng: number; lat: number }>): Bounds | null {
  if (!points.length) return null;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const lngs = [...new Set(points.map((p) => p.lng))].sort((a, b) => a - b);
  if (lngs.length === 1) return [lngs[0]!, south, lngs[0]!, north];
  const min = lngs[0]!;
  const max = lngs.at(-1)!;
  // The widest empty gap between consecutive longitudes decides where the box "opens".
  let gap = 0;
  let west = min;
  let east = max;
  for (let i = 1; i < lngs.length; i++) {
    const g = lngs[i]! - lngs[i - 1]!;
    if (g > gap) {
      gap = g;
      west = lngs[i]!;
      east = lngs[i - 1]! + 360;
    }
  }
  // Only cross the antimeridian when that is clearly tighter than the plain box; a
  // world-wide set stays centred on Greenwich.
  const plainSpan = max - min;
  const wrapSpan = 360 - gap;
  if (wrapSpan < plainSpan - 30 && wrapSpan < 200) return [west, south, east, north];
  return [min, south, max, north];
}

export interface LngLat {
  lng: number;
  lat: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km (haversine). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Longitude folded into [-180, 180) (map centres can sit on a world copy). */
export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** A map camera: centre and zoom. */
export interface MapViewState {
  lng: number;
  lat: number;
  zoom: number;
}
