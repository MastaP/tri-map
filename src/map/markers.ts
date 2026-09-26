/**
 * Plain-DOM builders for the HTML map markers (race glyphs, cluster donuts, the
 * selection halo). Kept out of React: maplibre owns their positioning.
 */
import { BRAND_IDS, BRANDS, brandGlyphSvg, DISTANCES, glyphPixelSize, type BrandId } from '../data/brands.ts';
import { isNearStandard, legsText, raceLegs } from '../data/course.ts';
import type { NextEdition } from '../data/nextEdition.ts';
import { shownRegistration, type RaceRegistration } from '../data/registration.ts';
import type { Race } from '../data/types.ts';
import { formatDate, formatMonthShort, localToday, type ISODate } from '../lib/dates.ts';
import { asOfText, ENTRY_BADGE, REGISTRATION_BADGE, registrationSummary } from '../lib/raceText.ts';

export const MARKER_CORE_PX = 26;

export interface ClusterProps {
  cluster_id: number;
  point_count: number;
  ironman: number;
  challenge: number;
  t100: number;
  independent: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The date shown for a race's edition (the one matching the date filter, if any). */
export function raceWhen(next: NextEdition | null): string {
  if (!next) return 'No upcoming date';
  if (next.estimated) return `≈ ${formatMonthShort(next.date)} · date TBA`;
  return `${formatDate(next.date)}${next.status === 'tentative' ? ' (TBC)' : ''}`;
}

/** "Qualifier only" / "Ballot", or null for open entry. */
export function entryLabel(race: Race): string | null {
  return race.entry === 'open' ? null : ENTRY_BADGE[race.entry];
}

/** "Non-standard distance: 3.4 / 202 / 41 km", or null for a race over the standard distances. */
export function nonStandardLabel(race: Race): string | null {
  return isNearStandard(race) ? `Non-standard distance: ${legsText(raceLegs(race))}` : null;
}

/** The registration status a marker shows for `edition` (none for open entry). */
export function markerRegistration(race: Race, edition: NextEdition | null): RaceRegistration | undefined {
  const reg = shownRegistration(race, edition);
  return reg && reg.status !== 'open' ? reg : undefined;
}

/** "Sold out · as of 26 Sep" for the map tooltip and the venue popup. */
export function registrationLabel(reg: RaceRegistration, today: ISODate = localToday()): string {
  if (reg.status === 'open') return '';
  return `${REGISTRATION_BADGE[reg.status]} · ${asOfText(reg.checkedAt, today)}`;
}

/** What a race marker shows; a marker whose signature changed is rebuilt. */
export function markerSignature(edition: NextEdition | null, registration?: RaceRegistration): string {
  const base = edition ? `${edition.date}|${edition.estimated ? 'e' : edition.status}` : 'none';
  return registration ? `${base}|${registration.status}|${registration.checkedAt}` : base;
}

export function raceMarkerElement(
  race: Race,
  edition: NextEdition | null,
  handlers: { onClick: (id: string) => void; onHover: (id: string | null) => void },
): HTMLElement {
  const root = el('div', 'tm-marker');
  const reg = markerRegistration(race, edition);
  root.dataset.id = race.id;
  root.dataset.sig = markerSignature(edition, reg);
  root.style.zIndex = '2';
  const halo = race.distance === 'full';
  const px = glyphPixelSize(MARKER_CORE_PX, halo);
  const btn = el('button', 'tm-pin');
  btn.type = 'button';
  btn.tabIndex = -1; // the results list is the keyboard path
  btn.style.width = `${px}px`;
  btn.style.height = `${px}px`;
  const entry = entryLabel(race);
  const course = nonStandardLabel(race);
  btn.setAttribute(
    'aria-label',
    [
      race.name,
      BRANDS[race.brand].label,
      DISTANCES[race.distance].long,
      course,
      entry,
      reg && registrationSummary(reg, localToday()),
      raceWhen(edition),
    ]
      .filter(Boolean)
      .join(', '),
  );
  btn.innerHTML = brandGlyphSvg(race.brand, {
    hollow: !!edition?.estimated,
    halo,
    ring: 'var(--tm-marker-ring)',
  });
  // Same words and look as the distance badge on the cards: FULL / HALF / T100.
  const tag = el('span', `tm-tag tm-tag-${race.distance}`, DISTANCES[race.distance].label);
  tag.setAttribute('aria-hidden', 'true');
  const tip = el('span', 'tm-tip');
  tip.setAttribute('aria-hidden', 'true');
  const title = el('strong', undefined, race.name);
  tip.append(title, el('span', undefined, `${raceWhen(edition)} · ${race.city}`));
  if (entry) tip.append(el('em', `tm-tip-entry tm-tip-entry-${race.entry}`, entry));
  if (reg) tip.append(el('em', `tm-tip-reg tm-tip-reg-${reg.status}`, registrationLabel(reg)));
  if (course) tip.append(el('em', 'tm-tip-course', course));
  root.append(btn, tag, tip);
  // Qualifier-only / ballot races carry a small lock / ticket pip, as on the cards.
  if (race.entry !== 'open') {
    const pip = el('span', `tm-entry-pip tm-entry-pip-${race.entry}`);
    pip.setAttribute('aria-hidden', 'true');
    pip.innerHTML = race.entry === 'qualification' ? LOCK_SVG : TICKET_SVG;
    btn.append(pip);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onClick(race.id);
  });
  root.addEventListener('mouseenter', () => {
    root.style.zIndex = '20';
    handlers.onHover(race.id);
  });
  root.addEventListener('mouseleave', () => {
    root.style.zIndex = '2';
    handlers.onHover(null);
  });
  return root;
}

const LOCK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const TICKET_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2Z"/><path d="M13 6v12"/></svg>';

/** Donut diameter: small enough that neighbouring clusters rarely touch. */
export function clusterSize(n: number): number {
  if (n < 10) return 32;
  if (n < 50) return 38;
  if (n < 100) return 44;
  return 50;
}

/** Clusters this small are drawn as a fan of their brand glyphs instead of a donut. */
export const FAN_MAX = 3;
const FAN_GLYPH_PX = 22;
const FAN_OFFSETS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  2: [
    [-6, 0],
    [6, 0],
  ],
  3: [
    [-7, 3],
    [7, 3],
    [0, -5],
  ],
};

/** The brands of a cluster's races, one entry per race, in legend order. */
export function clusterBrands(p: ClusterProps): BrandId[] {
  return BRAND_IDS.flatMap((b) => Array.from({ length: p[b] }, () => b));
}

/** SVG donut: one arc per brand proportional to its share, total in the middle. */
export function donutSvg(p: ClusterProps): string {
  const size = clusterSize(p.point_count);
  const c = size / 2;
  const w = Math.round(size * 0.19);
  const r = c - w / 2 - 2;
  const C = 2 * Math.PI * r;
  const parts = BRAND_IDS.filter((b) => p[b] > 0);
  // A clear gap between arcs keeps neighbouring brand colours apart for colour-blind viewers.
  const gap = parts.length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = parts
    .map((b) => {
      const len = (p[b] / p.point_count) * C;
      const arc = `<circle cx="${c}" cy="${c}" r="${r}" style="fill:none;stroke:${BRANDS[b].color};stroke-width:${w}" stroke-dasharray="${Math.max(len - gap, 0.8).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
      offset += len;
      return arc;
    })
    .join('');
  const fontSize = p.point_count >= 100 ? size * 0.34 : size * 0.4;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="${c}" cy="${c}" r="${c - 0.5}" style="fill:var(--tm-marker-ring)"/>` +
    arcs +
    `<circle cx="${c}" cy="${c}" r="${r - w / 2}" style="fill:var(--tm-surface)"/>` +
    `<text x="${c}" y="${c + 0.5}" text-anchor="middle" dominant-baseline="central" style="fill:var(--tm-fg);font-size:${fontSize.toFixed(1)}px">${p.point_count}</text>` +
    `</svg>`
  );
}

export function clusterBreakdown(p: ClusterProps): string {
  return BRAND_IDS.filter((b) => p[b] > 0)
    .map((b) => `${p[b]} ${BRANDS[b].label}`)
    .join(' · ');
}

/** A few races close together: their own brand glyphs, slightly fanned out. */
function fanHtml(p: ClusterProps): { html: string; size: number } {
  const brands = clusterBrands(p);
  const offsets = FAN_OFFSETS[brands.length] ?? FAN_OFFSETS[2]!;
  const size = FAN_GLYPH_PX + 16;
  const html = brands
    .map((b, i) => {
      const [dx, dy] = offsets[i] ?? [0, 0];
      const left = size / 2 - FAN_GLYPH_PX / 2 + dx;
      const top = size / 2 - FAN_GLYPH_PX / 2 + dy;
      return `<span class="tm-fan-glyph" style="left:${left}px;top:${top}px;width:${FAN_GLYPH_PX}px;height:${FAN_GLYPH_PX}px">${brandGlyphSvg(b, { ring: 'var(--tm-marker-ring)' })}</span>`;
    })
    .join('');
  return { html, size };
}

export function clusterElement(p: ClusterProps, onClick: () => void): HTMLElement {
  const fan = p.point_count <= FAN_MAX;
  const root = el('div', `tm-marker tm-cluster${fan ? ' tm-fan' : ''}`);
  root.style.zIndex = '1';
  const btn = el('button', 'tm-pin');
  btn.type = 'button';
  btn.tabIndex = -1;
  btn.setAttribute('aria-label', `${p.point_count} races: ${clusterBreakdown(p)}. Click to zoom in.`);
  if (fan) {
    const { html, size } = fanHtml(p);
    btn.style.width = `${size}px`;
    btn.style.height = `${size}px`;
    btn.innerHTML = html;
  } else {
    const size = clusterSize(p.point_count);
    btn.style.width = `${size}px`;
    btn.style.height = `${size}px`;
    btn.innerHTML = donutSvg(p);
  }
  const tip = el('span', 'tm-tip');
  tip.setAttribute('aria-hidden', 'true');
  tip.append(el('strong', undefined, `${p.point_count} races`), el('span', undefined, clusterBreakdown(p)));
  root.append(btn, tip);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  root.addEventListener('mouseenter', () => (root.style.zIndex = '20'));
  root.addEventListener('mouseleave', () => (root.style.zIndex = '1'));
  return root;
}

export function selectionElement(): HTMLElement {
  const root = el('div', 'tm-marker tm-selection');
  root.style.zIndex = '30';
  root.setAttribute('aria-hidden', 'true');
  root.append(el('span', 'tm-pulse'), el('span', 'tm-pin'));
  return root;
}

export function updateSelectionElement(root: HTMLElement, race: Race, edition: NextEdition | null): void {
  const pin = root.querySelector<HTMLElement>('.tm-pin')!;
  const halo = race.distance === 'full';
  pin.innerHTML = brandGlyphSvg(race.brand, {
    hollow: !edition || edition.estimated,
    ring: 'var(--tm-marker-ring)',
    halo,
  });
  pin.classList.toggle('tm-pin-halo', halo);
  root.style.setProperty('--tm-sel-color', BRANDS[race.brand].color);
}

/**
 * Shown while a list card is hovered and its race sits inside a cluster: the race's own
 * glyph pops up above its location, on a short pointer, leaving the cluster count readable.
 */
export function hoverPopElement(): HTMLElement {
  const root = el('div', 'tm-hover-pop');
  root.style.zIndex = '25';
  root.setAttribute('aria-hidden', 'true');
  root.append(el('span', 'tm-hover-pop-glyph'), el('span', 'tm-hover-pop-stem'), el('span', 'tm-hover-pop-dot'));
  return root;
}

export function updateHoverPopElement(root: HTMLElement, race: Race, edition: NextEdition | null): void {
  root.querySelector<HTMLElement>('.tm-hover-pop-glyph')!.innerHTML = brandGlyphSvg(race.brand, {
    hollow: !edition || edition.estimated,
    ring: 'var(--tm-marker-ring)',
  });
  root.style.setProperty('--tm-sel-color', BRANDS[race.brand].color);
}

/** Popup content listing races that share one spot (e.g. a full + half on one venue). */
export function clusterPopupContent(
  races: Race[],
  editionOf: (r: Race) => NextEdition | null,
  onPick: (id: string) => void,
): HTMLElement {
  const root = el('div', 'tm-popup-list');
  root.append(el('h4', undefined, `${races.length} races at this venue`));
  const ul = el('ul');
  for (const r of races) {
    const li = el('li');
    const b = el('button');
    b.type = 'button';
    const glyph = el('span', 'tm-popup-glyph');
    glyph.innerHTML = brandGlyphSvg(r.brand as BrandId, {
      hollow: !!editionOf(r)?.estimated,
      ring: 'var(--tm-surface)',
    });
    const text = el('span');
    const entry = entryLabel(r);
    const meta = el('span', 'tm-popup-meta', raceWhen(editionOf(r)));
    if (entry) meta.append(' ', el('em', `tm-popup-entry tm-popup-entry-${r.entry}`, entry));
    const reg = markerRegistration(r, editionOf(r));
    if (reg) meta.append(' ', el('em', `tm-popup-reg tm-popup-reg-${reg.status}`, registrationLabel(reg)));
    const course = nonStandardLabel(r);
    if (course) meta.append(el('span', 'tm-popup-course', course));
    text.append(document.createTextNode(`${r.name} · ${DISTANCES[r.distance].label}`), meta);
    b.append(glyph, text);
    b.addEventListener('click', () => onPick(r.id));
    li.append(b);
    ul.append(li);
  }
  root.append(ul);
  return root;
}
