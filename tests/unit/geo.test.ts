import { describe, expect, it } from 'vitest';
import { inBounds, normalizeBounds, pointsBounds } from '../../src/lib/geo.ts';

describe('geo', () => {
  it('normalizes a map box to west in [-180, 180), keeping what it covers', () => {
    expect(normalizeBounds([4, 51, 6, 53])).toEqual([4, 51, 6, 53]);
    expect(normalizeBounds([-200, -50, -150, 25])).toEqual([160, -50, 210, 25]);
    expect(normalizeBounds([190, 0, 200, 10])).toEqual([-170, 0, -160, 10]);
    expect(normalizeBounds([-300, -60, 300, 80])).toEqual([-180, -60, 180, 80]);
    // Kona is inside the Pacific box before and after.
    expect(inBounds(-155.99, 19.64, normalizeBounds([-200, -50, -150, 25]))).toBe(true);
  });

  it('checks bounds including antimeridian-crossing boxes', () => {
    expect(inBounds(8.68, 50.11, [-10, 35, 30, 70])).toBe(true);
    expect(inBounds(-155.99, 19.64, [160, -50, 210, 25])).toBe(true); // Kona in a Pacific box
    expect(inBounds(0, 0, [160, -50, 210, 25])).toBe(false);
    expect(inBounds(123, 10, [-540, -80, 540, 80])).toBe(true); // world copies
  });

  it('computes the tightest bounds, crossing the antimeridian when shorter', () => {
    expect(pointsBounds([])).toBeNull();
    expect(
      pointsBounds([
        { lng: 5, lat: 50 },
        { lng: 10, lat: 45 },
      ]),
    ).toEqual([5, 45, 10, 50]);
    const pacific = pointsBounds([
      { lng: 169.13, lat: -44.7 },
      { lng: 178.4, lat: -18.1 },
      { lng: -149.57, lat: -17.53 },
    ])!;
    expect(pacific[0]).toBe(169.13);
    expect(pacific[2]).toBeCloseTo(210.43);
  });
});

describe('pointsBounds on world-wide data', () => {
  it('keeps a world-spanning set centred on Greenwich', () => {
    const b = pointsBounds([
      { lng: -155.99, lat: 19.64 },
      { lng: -48.49, lat: -27.44 },
      { lng: -9.42, lat: 38.7 },
      { lng: 8.68, lat: 50.11 },
      { lng: 108.25, lat: 16.07 },
      { lng: 169.13, lat: -44.7 },
    ])!;
    expect(b).toEqual([-155.99, -44.7, 169.13, 50.11]);
  });
});
