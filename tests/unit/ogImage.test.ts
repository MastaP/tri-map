import { describe, expect, it } from 'vitest';
import { BRAND_IDS, BRANDS } from '../../src/data/brands.ts';
import { LOGOS } from '../../src/data/logos.ts';
import { ogImageHtml } from '../../scripts/ogImage.ts';

describe('share image', () => {
  const html = ogImageHtml({ fonts: {} });

  it('shows every brand with its glyph and name', () => {
    for (const b of BRAND_IDS) expect(html).toContain(`>${BRANDS[b].label}</span>`);
    for (const logo of Object.values(LOGOS)) expect(html).toContain(`d="${logo.paths[0]}"`);
  });

  it('names the brands it covers, XTERRA included', () => {
    expect(html).toContain('Every IRONMAN, 70.3, Challenge, T100, XTERRA and notable independent race');
  });

  it('is laid out for a 1200 × 630 preview', () => {
    expect(html).toContain('width: 1200px');
    expect(html).toContain('height: 630px');
  });
});
