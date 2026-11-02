/**
 * Brand identity for markers, chips and the legend.
 *
 * Each brand's glyph is a badge in its colour carrying the organiser's own mark in white
 * (./logos.ts; trademarks of their owners). Independent races have no common mark and
 * get a spark. Every brand also differs in badge shape, so the glyphs stay identifiable
 * for colour-blind users and in greyscale.
 */
import { LOGOS, type BrandLogo } from './logos.ts';

export const BRAND_IDS = ['ironman', 'challenge', 't100', 'xterra', 'independent'] as const;
export type BrandId = (typeof BRAND_IDS)[number];

/** What is raced: swim–bike–run, run–bike–run, or the bike alone. */
export const SPORT_IDS = ['triathlon', 'duathlon', 'time-trial'] as const;
export type SportId = (typeof SPORT_IDS)[number];

/**
 * Distance categories, longest triathlon first. Long-distance triathlons are the core of
 * TriMap; the shorter categories, duathlons and time trials come after them everywhere
 * they are listed (filter tiles, summaries).
 */
export const DISTANCE_IDS = ['full', 'half', 't100', 'olympic', 'sprint', 'cross', 'duathlon', 'time-trial'] as const;
export type DistanceId = (typeof DISTANCE_IDS)[number];

export type BrandShape = 'circle' | 'square' | 'hexagon' | 'pentagon' | 'diamond';

export interface BrandStyle {
  id: BrandId;
  label: string;
  /** What the brand covers, for tooltips and the legend. */
  description: string;
  /** Fill colour; chosen to read on both the light and the dark basemap. */
  color: string;
  /** Colour of the mark drawn on top of `color` (AA contrast). */
  ink: string;
  shape: BrandShape;
  /** The organiser's mark, fitted into `logoBox`; or null to draw `glyphPath`. */
  logo: BrandLogo | null;
  /** Where the logo sits in the 32×32 badge: x, y, width, height (centred, kept in proportion). */
  logoBox?: readonly [number, number, number, number];
  /** The mark of a brand without a logo (viewBox 0 0 32 32). */
  glyphPath?: string;
}

export const BRANDS: Record<BrandId, BrandStyle> = {
  ironman: {
    id: 'ironman',
    label: 'IRONMAN',
    description: 'IRONMAN and IRONMAN 70.3',
    color: '#D42A1F',
    ink: '#FFFFFF',
    shape: 'circle',
    // The M-Dot: taller than wide.
    logo: LOGOS.ironman,
    logoBox: [7.5, 7, 17, 17.6],
  },
  challenge: {
    id: 'challenge',
    label: 'Challenge',
    description: 'Challenge Family',
    color: '#1D5FD6',
    ink: '#FFFFFF',
    shape: 'square',
    logo: LOGOS.challenge,
    logoBox: [7.6, 7.6, 16.8, 17.2],
  },
  t100: {
    id: 't100',
    label: 'T100',
    // Named after what age-groupers race (the 100 km), not the pro tour.
    description: 'T100 races over 100 km, incl. T100 Challenger',
    // Teal, not violet: violet and the Challenge blue look alike with red-green colour
    // blindness (ΔE2000 3.5 simulated); teal stays ≥ 14 apart from every other brand.
    color: '#0D9488',
    ink: '#FFFFFF',
    shape: 'hexagon',
    // A wide wordmark: as wide as the hexagon allows.
    logo: LOGOS.t100,
    logoBox: [3.4, 11, 25.2, 10],
  },
  xterra: {
    id: 'xterra',
    label: 'XTERRA',
    description: 'XTERRA off-road triathlons',
    // Slate, after XTERRA's black: dark enough for the white X (4.8:1), light enough to
    // stand out on the dark theme's panels (3.6:1), and neutral next to the other brands.
    color: '#64748B',
    ink: '#FFFFFF',
    shape: 'pentagon',
    logo: LOGOS.xterra,
    logoBox: [7.2, 11.6, 17.6, 11.6],
  },
  independent: {
    id: 'independent',
    label: 'Independent',
    description: 'Independent races and other series',
    color: '#F0A30A',
    ink: '#2A1B00',
    shape: 'diamond',
    logo: null,
    // A four-point spark: distinct from the five-point shortlist star.
    glyphPath: 'M16 7.6 18.2 13.8 24.4 16 18.2 18.2 16 24.4 13.8 18.2 7.6 16 13.8 13.8Z',
  },
};

/** Outline paths in a 32×32 viewBox. Shapes are optically balanced to similar weight. */
export const SHAPE_PATHS: Record<BrandShape, string> = {
  circle: 'M16 2.5a13.5 13.5 0 1 1 0 27a13.5 13.5 0 1 1 0-27Z',
  square: 'M9.5 3.5h13a6 6 0 0 1 6 6v13a6 6 0 0 1-6 6h-13a6 6 0 0 1-6-6v-13a6 6 0 0 1 6-6Z',
  hexagon:
    'M14.3 2.4a3.4 3.4 0 0 1 3.4 0l9.6 5.55a3.4 3.4 0 0 1 1.7 2.94v10.22a3.4 3.4 0 0 1-1.7 2.94L17.7 29.6a3.4 3.4 0 0 1-3.4 0L4.7 24.05a3.4 3.4 0 0 1-1.7-2.94V10.89a3.4 3.4 0 0 1 1.7-2.94Z',
  pentagon:
    'M18.1 4.33L27.59 11.22Q29.7 12.75 28.89 15.22L25.27 26.38Q24.46 28.85 21.86 28.85L10.14 28.85Q7.54 28.85 6.73 26.38L3.11 15.22Q2.3 12.75 4.41 11.22L13.9 4.33Q16 2.8 18.1 4.33Z',
  diamond:
    'M13.7 1.95a3.25 3.25 0 0 1 4.6 0l11.75 11.75a3.25 3.25 0 0 1 0 4.6L18.3 30.05a3.25 3.25 0 0 1-4.6 0L1.95 18.3a3.25 3.25 0 0 1 0-4.6Z',
};

/** Official swim / bike / run km of a triathlon category. */
export interface TriathlonLegs {
  swim: number;
  bike: number;
  run: number;
}

export interface DistanceStyle {
  id: DistanceId;
  sport: SportId;
  /** Short name for filter tiles ("Full"). */
  label: string;
  /** Spoken/long name ("Full distance"), used in aria labels and tooltips. */
  long: string;
  /** Text of the compact distance badge on cards: what an age-grouper calls the race. */
  badge: string;
  /** Text of the larger badge in the race detail. */
  badgeLong: string;
  /** Text of the small distance tag on map markers. */
  tag: string;
  /**
   * Words that find the category in the free-text search, for races whose name may not
   * say it ("RBR Almere" is a duathlon); null for the classic triathlon categories.
   */
  searchWords: string | null;
  /**
   * The category's standard km, or null for duathlons and time trials: their legs vary
   * too much for one standard, so every such race gives its own `course` (data/README.md).
   */
  standard: TriathlonLegs | null;
  /** Total standard km, or null without a standard. */
  total: number | null;
  /**
   * How far (0.25 = 25%) a leg may be from `standard` with the race still in this category;
   * the data validation rejects a `course` beyond it. Short races vary more than long ones.
   */
  maxDeviation: number;
}

const triathlon = (swim: number, bike: number, run: number, maxDeviation: number) => ({
  sport: 'triathlon' as const,
  searchWords: null,
  standard: { swim, bike, run },
  total: Math.round((swim + bike + run) * 100) / 100,
  maxDeviation,
});

export const DISTANCES: Record<DistanceId, DistanceStyle> = {
  full: {
    id: 'full',
    label: 'Full',
    long: 'Full distance',
    badge: 'Full',
    badgeLong: 'Full distance',
    tag: 'Full',
    ...triathlon(3.8, 180, 42.2, 0.25),
    total: 226,
  },
  half: {
    id: 'half',
    label: 'Half',
    long: 'Half distance',
    badge: 'Half',
    badgeLong: 'Half distance',
    tag: 'Half',
    ...triathlon(1.9, 90, 21.1, 0.25),
    total: 113,
  },
  // "T100" alone means little to most age-groupers; say how far it is.
  t100: {
    id: 't100',
    label: 'T100',
    long: 'T100 distance',
    badge: 'T100 · 100 km',
    badgeLong: 'T100 · 100 km',
    tag: 'T100',
    ...triathlon(2, 80, 18, 0.25),
  },
  // Short races are held over many local variants (a Dutch "kwart" is 1 / 40 / 10), so a
  // leg may be up to half off the standard.
  olympic: {
    id: 'olympic',
    label: 'Olympic',
    long: 'Olympic distance',
    badge: 'Olympic',
    badgeLong: 'Olympic distance',
    tag: 'Oly',
    ...triathlon(1.5, 40, 10, 0.5),
  },
  sprint: {
    id: 'sprint',
    label: 'Sprint',
    long: 'Sprint distance',
    badge: 'Sprint',
    badgeLong: 'Sprint distance',
    tag: 'Sprint',
    ...triathlon(0.75, 20, 5, 0.5),
  },
  // Off-road (cross) triathlon, XTERRA and the like: open water, mountain bike, trail run,
  // over legs that vary too much from race to race for a standard.
  cross: {
    id: 'cross',
    sport: 'triathlon',
    label: 'Off-road',
    long: 'Off-road triathlon',
    badge: 'Off-road',
    badgeLong: 'Off-road triathlon',
    tag: 'Off-road',
    searchWords: 'cross off-road offroad',
    standard: null,
    total: null,
    maxDeviation: 0,
  },
  duathlon: {
    id: 'duathlon',
    sport: 'duathlon',
    label: 'Duathlon',
    long: 'Duathlon',
    badge: 'Duathlon',
    badgeLong: 'Duathlon',
    tag: 'Du',
    searchWords: 'duathlon',
    standard: null,
    total: null,
    maxDeviation: 0,
  },
  'time-trial': {
    id: 'time-trial',
    sport: 'time-trial',
    label: 'Time trial',
    long: 'Bike time trial',
    badge: 'Time trial',
    badgeLong: 'Bike time trial',
    tag: 'TT',
    searchWords: 'time trial',
    standard: null,
    total: null,
    maxDeviation: 0,
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

const num = (n: number) => String(Math.round(n * 10000) / 10000);

/**
 * The transform that fits a logo into its box, centred and in proportion. A transform
 * rather than a nested <svg>: page CSS that sizes marker SVGs would also resize a nested one.
 */
function logoTransform(logo: BrandLogo, [x, y, w, h]: readonly [number, number, number, number]): string {
  const [vx, vy, vw, vh] = logo.viewBox.split(' ').map(Number) as [number, number, number, number];
  const k = Math.min(w / vw, h / vh);
  const tx = x + (w - vw * k) / 2;
  const ty = y + (h - vh * k) / 2;
  return `translate(${num(tx)} ${num(ty)}) scale(${num(k)}) translate(${num(-vx)} ${num(-vy)})`;
}

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
  if (b.logo && b.logoBox) {
    const paths = b.logo.paths.map((d) => `<path d="${d}" style="fill:${ink}"/>`).join('');
    parts.push(`<g transform="${logoTransform(b.logo, b.logoBox)}">${paths}</g>`);
  } else if (b.glyphPath) {
    parts.push(`<path d="${b.glyphPath}" style="fill:${ink}"/>`);
  }
  const a11y = opts.title ? `role="img" aria-label="${escapeXml(opts.title)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${a11y}>${parts.join('')}</svg>`;
}

/** Rendered size in px for a glyph whose core shape is `core` px (accounts for padding). */
export function glyphPixelSize(core: number, halo = false): number {
  return (core * (32 + (halo ? 8 : 3))) / 32;
}
