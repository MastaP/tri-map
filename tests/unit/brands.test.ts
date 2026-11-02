import { describe, expect, it } from 'vitest';
import { BRAND_IDS, BRANDS, brandGlyphSvg } from '../../src/data/brands.ts';
import { LOGOS } from '../../src/data/logos.ts';

describe('brand glyphs', () => {
  it('draws each brand with a mark of its own: the official logo, or the spark for independents', () => {
    expect(BRAND_IDS).toEqual(['ironman', 'challenge', 't100', 'xterra', 'independent']);
    for (const id of ['ironman', 'challenge', 't100', 'xterra'] as const) {
      const svg = brandGlyphSvg(id);
      for (const d of LOGOS[id].paths) expect(svg).toContain(`d="${d}"`);
      // Placed by a transform, not a nested <svg>: page CSS sizing marker SVGs
      // (.tm-pin svg { width: 100% }) must not stretch the logo out of its badge.
      expect(svg.match(/<svg/g)).toHaveLength(1);
      expect(svg).toMatch(/<g transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\) translate\(-?[\d.]+ -?[\d.]+\)">/);
      // White on the brand colour.
      expect(svg).toContain(`fill:${BRANDS[id].color}`);
      expect(svg).toMatch(/<path d="M[^"]+" style="fill:#FFFFFF"/);
      expect(svg).not.toContain('<text');
    }
    expect(brandGlyphSvg('independent')).toContain(`d="${BRANDS.independent.glyphPath}"`);
  });

  it('draws the logo in the brand colour on a pale badge when the date is only estimated', () => {
    const svg = brandGlyphSvg('ironman', { hollow: true });
    expect(svg).toContain(`style="fill:var(--tm-hollow-ink, ${BRANDS.ironman.color})"`);
    expect(svg).toContain('stroke-dasharray');
  });

  it('gives every brand its own shape, so the glyphs differ without colour too', () => {
    const shapes = BRAND_IDS.map((b) => BRANDS[b].shape);
    expect(new Set(shapes).size).toBe(BRAND_IDS.length);
  });

  it('labels the glyph for assistive technology only when asked', () => {
    expect(brandGlyphSvg('xterra', { title: 'XTERRA' })).toContain('role="img" aria-label="XTERRA"');
    expect(brandGlyphSvg('xterra')).toContain('aria-hidden="true"');
  });

  it('fits the logo into its box, centred and in proportion', () => {
    // The T100 wordmark (200 × 38.4) is width-bound in its 25.2 × 10 box.
    const m = brandGlyphSvg('t100').match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!;
    const [x, y, k] = m.slice(1).map(Number) as [number, number, number];
    expect(k).toBeCloseTo(25.2 / 200, 4);
    expect(x).toBeCloseTo(3.4, 3);
    expect(y).toBeCloseTo(11 + (10 - 38.409 * k) / 2, 3);
  });
});
