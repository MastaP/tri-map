/**
 * Brand identity for markers, chips and the legend.
 *
 * These are original monogram glyphs, NOT the organisers' logos (which are trademarks).
 * Every brand differs in shape, colour and monogram so it stays identifiable for
 * colour-blind users and in greyscale.
 */

export const BRAND_IDS = ['ironman', 'challenge', 't100', 'independent'] as const;
export type BrandId = (typeof BRAND_IDS)[number];

export const DISTANCE_IDS = ['full', 'half', 't100'] as const;
export type DistanceId = (typeof DISTANCE_IDS)[number];

export type BrandShape = 'circle' | 'square' | 'hexagon' | 'diamond';

export interface BrandStyle {
  id: BrandId;
  label: string;
  /** What the brand covers, for tooltips and the legend. */
  description: string;
  /** Fill colour; chosen to read on both the light and the dark basemap. */
  color: string;
  /** Colour of the monogram drawn on top of `color` (AA contrast). */
  ink: string;
  shape: BrandShape;
  /** Text monogram, or null when the glyph is drawn as a path (see `glyphPath`). */
  monogram: string | null;
  /** Optional path drawn instead of a text monogram (viewBox 0 0 32 32). */
  glyphPath?: string;
  /** Font size of the monogram in the 32×32 viewBox. */
  monogramSize: number;
}

export const BRANDS: Record<BrandId, BrandStyle> = {
  ironman: {
    id: 'ironman',
    label: 'IRONMAN',
    description: 'IRONMAN and IRONMAN 70.3',
    color: '#D42A1F',
    ink: '#FFFFFF',
    shape: 'circle',
    monogram: 'IM',
    monogramSize: 15,
  },
  challenge: {
    id: 'challenge',
    label: 'Challenge',
    description: 'Challenge Family',
    color: '#1D5FD6',
    ink: '#FFFFFF',
    shape: 'square',
    monogram: 'C',
    monogramSize: 19,
  },
  t100: {
    id: 't100',
    label: 'T100',
    description: 'T100 World Championship Tour and T100 Challenger',
    // Teal, not violet: violet and the Challenge blue look alike with red-green colour
    // blindness (ΔE2000 3.5 simulated); teal stays ≥ 14 apart from every other brand.
    color: '#0D9488',
    ink: '#FFFFFF',
    shape: 'hexagon',
    monogram: 'T',
    monogramSize: 19,
  },
  independent: {
    id: 'independent',
    label: 'Independent',
    description: 'Independent races and other series',
    color: '#F0A30A',
    ink: '#2A1B00',
    shape: 'diamond',
    monogram: null,
    // A four-point spark: distinct from the five-point shortlist star.
    glyphPath: 'M16 7.6 18.2 13.8 24.4 16 18.2 18.2 16 24.4 13.8 18.2 7.6 16 13.8 13.8Z',
    monogramSize: 0,
  },
};

/** Outline paths in a 32×32 viewBox. Shapes are optically balanced to similar weight. */
export const SHAPE_PATHS: Record<BrandShape, string> = {
  circle: 'M16 2.5a13.5 13.5 0 1 1 0 27a13.5 13.5 0 1 1 0-27Z',
  square: 'M9.5 3.5h13a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6h-13a6 6 0 0 1-6-6v-13a6 6 0 0 1 6-6Z',
  hexagon:
    'M14.3 2.4a3.4 3.4 0 0 1 3.4 0l9.6 5.55a3.4 3.4 0 0 1 1.7 2.94v10.22a3.4 3.4 0 0 1-1.7 2.94L17.7 29.6a3.4 3.4 0 0 1-3.4 0L4.7 24.05a3.4 3.4 0 0 1-1.7-2.94V10.89a3.4 3.4 0 0 1 1.7-2.94Z',
  diamond:
    'M13.7 1.95a3.25 3.25 0 0 1 4.6 0l11.75 11.75a3.25 3.25 0 0 1 0 4.6L18.3 30.05a3.25 3.25 0 0 1-4.6 0L1.95 18.3a3.25 3.25 0 0 1 0-4.6Z',
};

export interface DistanceStyle {
  id: DistanceId;
  /** Short name for filter tiles ("Full"). */
  label: string;
  /** Spoken/long name ("Full distance"), used in aria labels and tooltips. */
  long: string;
  /** Text of the compact distance badge on cards: what an age-grouper calls the race. */
  badge: string;
  /** Text of the larger badge in the race detail. */
  badgeLong: string;
  swim: number;
  bike: number;
  run: number;
  /** Total km, used as the small distance tag on markers. */
  total: number;
}

export const DISTANCES: Record<DistanceId, DistanceStyle> = {
  full: {
    id: 'full',
    label: 'Full',
    long: 'Full distance',
    badge: 'Full',
    badgeLong: 'Full distance',
    swim: 3.8,
    bike: 180,
    run: 42.2,
    total: 226,
  },
  half: {
    id: 'half',
    label: 'Half',
    long: 'Half distance',
    badge: 'Half',
    badgeLong: 'Half distance',
    swim: 1.9,
    bike: 90,
    run: 21.1,
    total: 113,
  },
  // "T100" alone means little to most age-groupers; say how far it is.
  t100: {
    id: 't100',
    label: 'T100',
    long: 'T100 distance',
    badge: 'T100 · 100 km',
    badgeLong: 'T100 · 100 km',
    swim: 2,
    bike: 80,
    run: 18,
    total: 100,
  },
};

export function isBrandId(value: string): value is BrandId {
  return (BRAND_IDS as readonly string[]).includes(value);
}

export function isDistanceId(value: string): value is DistanceId {
  return (DISTANCE_IDS as readonly string[]).includes(value);
}

export function formatKm(km: number): string {
  return `${km.toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
}

export interface GlyphOptions {
  /** Hollow, dashed outline: used for races whose next date is only estimated. */
  hollow?: boolean;
  /** Stroke colour of the ring around the glyph. */
  ring?: string;
  /** Extra outer ring used as the "full distance" cue on the map. */
  halo?: boolean;
  /** Accessible title; when omitted the SVG is aria-hidden. */
  title?: string;
}

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

/**
 * SVG markup for a brand glyph (viewBox 0 0 32 32). Used for the HTML map markers,
 * which are plain DOM for performance; the React `BrandGlyph` component renders the
 * same markup.
 */
export function brandGlyphSvg(brand: BrandId, opts: GlyphOptions = {}): string {
  const b = BRANDS[brand];
  const ring = opts.ring ?? '#FFFFFF';
  // Hollow (estimated date): a pale fill with the brand-coloured monogram; the dark theme
  // tints the fill with the brand colour and lightens the monogram (see index.css).
  const fill = opts.hollow
    ? `color-mix(in srgb, ${b.color} var(--tm-hollow-mix, 0%), var(--tm-hollow-fill, #FFFFFF))`
    : b.color;
  const ink = opts.hollow ? `var(--tm-hollow-ink, ${b.color})` : b.ink;
  const shape = SHAPE_PATHS[b.shape];
  const parts: string[] = [];
  const pad = opts.halo ? 4 : 1.5;
  const vb = `${-pad} ${-pad} ${32 + pad * 2} ${32 + pad * 2}`;
  if (opts.halo) {
    // Outer ring in the brand colour: the "full distance" cue.
    parts.push(
      `<path d="${shape}" transform="translate(16 16) scale(1.2) translate(-16 -16)" style="fill:none;stroke:${b.color};stroke-width:1.7;stroke-linejoin:round"/>`,
    );
  }
  if (opts.hollow) {
    parts.push(`<path d="${shape}" style="fill:${ring};stroke:${ring};stroke-width:4.2;stroke-linejoin:round"/>`);
    parts.push(
      `<path d="${shape}" style="fill:${fill};stroke:${b.color};stroke-width:2.2;stroke-dasharray:3.2 2.4;stroke-linejoin:round"/>`,
    );
  } else {
    parts.push(`<path d="${shape}" style="fill:${fill};stroke:${ring};stroke-width:2;stroke-linejoin:round"/>`);
  }
  if (b.glyphPath) {
    parts.push(`<path d="${b.glyphPath}" style="fill:${ink}"/>`);
  } else if (b.monogram) {
    parts.push(
      `<text x="16" y="16.8" text-anchor="middle" dominant-baseline="central" style="fill:${ink};font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:700;font-size:${b.monogramSize}px;letter-spacing:${b.monogram.length > 1 ? '-0.4px' : '0'}">${escapeXml(b.monogram)}</text>`,
    );
  }
  const a11y = opts.title ? `role="img" aria-label="${escapeXml(opts.title)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${a11y}>${parts.join('')}</svg>`;
}

/** Rendered size in px for a glyph whose core shape is `core` px (accounts for padding). */
export function glyphPixelSize(core: number, halo = false): number {
  return (core * (32 + (halo ? 8 : 3))) / 32;
}
