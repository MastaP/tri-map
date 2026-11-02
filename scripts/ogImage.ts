/**
 * The share image (public/og-image.png, 1200 × 630): what chat apps and social sites show
 * for a TriMap link. Built as an HTML page and screenshotted by scripts/og-image.ts, so it
 * follows the brand glyphs in src/data/brands.ts (the organisers' logos) and the brand
 * list when they change.
 */
import { BRAND_IDS, BRANDS, brandGlyphSvg } from '../src/data/brands.ts';

const BG = '#0c1220';
const ACCENT = '#c4f031';

/** The TriMap mark, as in the header (src/components/Icons.tsx LogoMark). */
const LOGO_MARK = `<svg viewBox="0 0 32 32" width="76" height="76" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="${BG}"/>
  <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#2a3446"/>
  <path d="M7.5 23.5c2.6 0 3.6-2.2 5-4.6s2.6-4.4 5-4.4 3.4 1.8 5.6-1" fill="none" stroke="${ACCENT}" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="7.5" cy="23.5" r="2.2" fill="${ACCENT}"/>
  <path d="M24.5 5.5a4 4 0 0 1 4 4c0 3-4 6.5-4 6.5s-4-3.5-4-6.5a4 4 0 0 1 4-4Z" fill="${ACCENT}"/>
  <circle cx="24.5" cy="9.5" r="1.4" fill="${BG}"/>
</svg>`;

/** Deterministic pseudo-random numbers (mulberry32), so the image only changes when the code does. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Race dots in the brand colours, scattered over the right of the image and fading leftwards. */
function dots(): string {
  const rnd = random(2026);
  const out: string[] = [];
  for (let i = 0; i < 110; i++) {
    const x = 840 + rnd() * 350;
    const y = 25 + rnd() * 580;
    const r = 3 + rnd() * 5;
    const brand = BRAND_IDS[Math.floor(rnd() * BRAND_IDS.length)]!;
    const fade = Math.min(1, (x - 840) / 220);
    const opacity = (0.25 + rnd() * 0.65) * (0.35 + 0.65 * fade);
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${BRANDS[brand].color}" opacity="${opacity.toFixed(2)}"/>`,
    );
  }
  return `<svg class="dots" width="1200" height="630" viewBox="0 0 1200 630" aria-hidden="true">${out.join('')}</svg>`;
}

export interface OgImageOptions {
  /** Font files as data: URLs, by family; the page falls back to system fonts without them. */
  fonts: { inter?: string; barlow?: string; barlowItalic?: string };
}

export function ogImageHtml({ fonts }: OgImageOptions): string {
  const face = (family: string, src: string | undefined, style: string, weight: string) =>
    src
      ? `@font-face { font-family: '${family}'; src: url(${src}) format('woff2'); font-style: ${style}; font-weight: ${weight}; }`
      : '';
  const brands = BRAND_IDS.map(
    (b) => `<span class="brand">${brandGlyphSvg(b, { ring: BG })}<span>${BRANDS[b].label}</span></span>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  ${face('Inter', fonts.inter, 'normal', '100 900')}
  ${face('Barlow Condensed', fonts.barlow, 'normal', '700')}
  ${face('Barlow Condensed', fonts.barlowItalic, 'italic', '700')}
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    overflow: hidden;
    position: relative;
    background: radial-gradient(circle at 92% 22%, #1b2538 0%, ${BG} 55%);
    color: #ffffff;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .dots { position: absolute; inset: 0; }
  .content { position: absolute; left: 72px; top: 60px; right: 72px; }
  .logo { display: flex; align-items: center; gap: 22px; }
  .wordmark { font: italic 700 64px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: -0.5px; }
  .wordmark b { color: ${ACCENT}; font-weight: 700; }
  h1 { margin-top: 66px; font: 700 92px/0.98 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.3px; }
  h1 em { font-style: normal; color: ${ACCENT}; }
  p { margin-top: 26px; max-width: 700px; font-size: 27px; line-height: 1.35; color: #a9b2c1; }
  .brands { position: absolute; left: 72px; bottom: 58px; display: flex; gap: 34px; align-items: center; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 500; color: #e6eaf0; }
  .brand svg { width: 34px; height: 34px; display: block; }
</style>
</head>
<body>
  ${dots()}
  <div class="content">
    <div class="logo">${LOGO_MARK}<span class="wordmark">Tri<b>Map</b></span></div>
    <h1>Find a <em>full or half</em><br>triathlon you can enter</h1>
    <p>Every IRONMAN, 70.3, Challenge, T100, XTERRA and notable independent race, worldwide, on one map.</p>
  </div>
  <div class="brands">${brands}</div>
</body>
</html>
`;
}
