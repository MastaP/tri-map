import { describe, expect, it } from 'vitest';
import { COUNTRIES, flagEmoji, getCountry, isInRegionBox, REGION_IDS } from '../../src/data/regions.ts';

describe('regions', () => {
  it.each([
    ['TR', 'europe'],
    ['CY', 'europe'],
    ['US', 'north-america'],
    ['CA', 'north-america'],
    ['BM', 'north-america'],
    ['MX', 'latin-america'],
    ['PR', 'latin-america'],
    ['BR', 'latin-america'],
    ['AE', 'middle-east'],
    ['BH', 'middle-east'],
    ['OM', 'middle-east'],
    ['QA', 'middle-east'],
    ['SA', 'middle-east'],
    ['IL', 'middle-east'],
    ['JO', 'middle-east'],
    ['KW', 'middle-east'],
    ['EG', 'africa'],
    ['MA', 'africa'],
    ['ZA', 'africa'],
    ['JP', 'asia'],
    ['IN', 'asia'],
    ['AU', 'oceania'],
    ['NZ', 'oceania'],
  ])('%s is in %s', (code, region) => {
    expect(getCountry(code)?.region).toBe(region);
  });

  it('has names and flags for every country, and uses only known regions', () => {
    for (const c of Object.values(COUNTRIES)) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(REGION_IDS).toContain(c.region);
      expect([...c.flag]).toHaveLength(2);
    }
    expect(Object.keys(COUNTRIES).length).toBeGreaterThan(150);
  });

  it('builds regional-indicator flag emoji', () => {
    expect(flagEmoji('DE')).toBe('🇩🇪');
    expect(flagEmoji('nz')).toBe('');
  });

  it('returns undefined for unknown codes, including prototype keys', () => {
    expect(getCountry('ZZ')).toBeUndefined();
    expect(getCountry('constructor')).toBeUndefined();
  });

  it('accepts real venues and rejects swapped signs', () => {
    expect(isInRegionBox('north-america', 19.64, -155.99)).toBe(true); // Kona
    expect(isInRegionBox('oceania', -17.53, -149.57)).toBe(true); // Tahiti, east of the antimeridian
    expect(isInRegionBox('oceania', -36.85, 174.76)).toBe(true); // Auckland
    expect(isInRegionBox('latin-america', 27.44, 48.49)).toBe(false); // Florianópolis with flipped signs
    expect(isInRegionBox('europe', -50.11, 8.68)).toBe(false); // Frankfurt with a negative lat
  });
});
