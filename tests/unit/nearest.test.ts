import { describe, expect, it } from 'vitest';
import { isListed } from '../../src/lib/filters.ts';
import { haversineKm, wrapLng } from '../../src/lib/geo.ts';
import { distancesFrom, formatDistanceAway, sortByDistance } from '../../src/lib/nearest.ts';
import { fixtureRaces } from './helpers.ts';

const races = fixtureRaces().filter(isListed);

describe('haversineKm', () => {
  it('measures great-circle distances', () => {
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeCloseTo(344, -1); // London–Paris
    expect(haversineKm(50.1106, 8.6821, 49.2461, 11.0911)).toBeCloseTo(194, -1); // Frankfurt–Roth
    expect(haversineKm(10, 20, 10, 20)).toBe(0);
    expect(haversineKm(0, 0, 0, 180)).toBeCloseTo(20015, -1); // half the equator
    // Across the antimeridian: Fiji ↔ Samoa is short, not most of the globe.
    expect(haversineKm(-18.14, 178.44, -13.83, -171.76)).toBeLessThan(1200);
  });

  it('folds map-centre longitudes back into [-180, 180)', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-190)).toBe(170);
    expect(wrapLng(540)).toBe(-180);
    expect(wrapLng(12.5)).toBe(12.5);
  });
});

describe('formatDistanceAway', () => {
  it('rounds to whole km nearby and to 10 km further away', () => {
    expect(formatDistanceAway(0.4)).toBe('under 1 km away');
    expect(formatDistanceAway(35.4)).toBe('35 km away');
    expect(formatDistanceAway(99.6)).toBe('100 km away');
    expect(formatDistanceAway(1236)).toBe('1,240 km away');
    expect(formatDistanceAway(12_345)).toBe('12,350 km away');
    expect(formatDistanceAway(Number.NaN)).toBe('');
  });
});

describe('sortByDistance', () => {
  it('orders races nearest first and keeps co-located races in date order', () => {
    const almere = { lat: 52.37, lng: 5.22 };
    const sorted = sortByDistance(races, almere).map((r) => r.id);
    expect(sorted.slice(0, 3)).toEqual([
      'challenge-almere-amsterdam-full',
      'challenge-almere-amsterdam-half',
      'ironman-frankfurt-full',
    ]);
    expect(sorted).toHaveLength(races.length);
  });

  it('works across the antimeridian', () => {
    const fiji = { lat: -18.14, lng: 178.44 };
    expect(sortByDistance(races, fiji)[0]!.id).toBe('t100-wanaka-t100');
  });

  it('returns a distance per race', () => {
    const km = distancesFrom(races, { lat: 50.1106, lng: 8.6821 });
    expect(km.size).toBe(races.length);
    expect(km.get('ironman-frankfurt-full')).toBeCloseTo(0, 5);
    expect(km.get('challenge-roth-full')).toBeGreaterThan(180);
  });
});
