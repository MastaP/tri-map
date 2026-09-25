/**
 * Plain-DOM builders for the HTML map markers (race glyphs, cluster donuts, the
 * selection halo). Kept out of React: maplibre owns their positioning.
 */
import { BRAND_IDS, BRANDS, brandGlyphSvg, DISTANCES, glyphPixelSize, type BrandId } from '../data/brands.ts';
import type { Race } from '../data/types.ts';
import { formatDate, formatMonthShort } from '../lib/dates.ts';

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

export function raceWhen(race: Race): string {
  const next = race.nextEdition;
  if (!next) return 'No upcoming date';
  if (next.estimated) return `≈ ${formatMonthShort(next.date)} · date TBA`;
  return `${formatDate(next.date)}${next.status === 'tentative' ? ' (TBC)' : ''}`;
}

export function raceMarkerElement(
  race: Race,
  handlers: { onClick: (id: string) => void; onHover: (id: string | null) => void },
): HTMLElement {
  const root = el('div', 'tm-marker');
  root.dataset.id = race.id;
  root.style.zIndex = '2';
  const halo = race.distance === 'full';
  const px = glyphPixelSize(MARKER_CORE_PX, halo);
  const btn = el('button', 'tm-pin');
  btn.type = 'button';
  btn.tabIndex = -1; // the results list is the keyboard path
  btn.style.width = `${px}px`;
  btn.style.height = `${px}px`;
  btn.setAttribute(
    'aria-label',
    `${race.name}, ${BRANDS[race.brand].label}, ${DISTANCES[race.distance].long}, ${raceWhen(race)}`,
  );
  btn.innerHTML = brandGlyphSvg(race.brand, {
    hollow: !!race.nextEdition?.estimated,
    halo,
    ring: 'var(--tm-marker-ring)',
  });
  const tag = el('span', 'tm-tag', `${DISTANCES[race.distance].total} km`);
  const tip = el('span', 'tm-tip');
  tip.append(el('strong', undefined, race.name), el('span', undefined, `${raceWhen(race)} · ${race.city}`));
  root.append(btn, tag, tip);

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

function clusterSize(n: number): number {
  if (n < 10) return 40;
  if (n < 50) return 48;
  if (n < 100) return 54;
  return 60;
}

/** SVG donut: one arc per brand proportional to its share, total in the middle. */
export function donutSvg(p: ClusterProps): string {
  const size = clusterSize(p.point_count);
  const c = size / 2;
  const w = Math.round(size * 0.19);
  const r = c - w / 2 - 2;
  const C = 2 * Math.PI * r;
  const parts = BRAND_IDS.filter((b) => p[b] > 0);
  const gap = parts.length > 1 ? 1.6 : 0;
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

export function clusterElement(p: ClusterProps, onClick: () => void): HTMLElement {
  const root = el('div', 'tm-marker tm-cluster');
  root.style.zIndex = '1';
  const size = clusterSize(p.point_count);
  const btn = el('button', 'tm-pin');
  btn.type = 'button';
  btn.tabIndex = -1;
  btn.style.width = `${size}px`;
  btn.style.height = `${size}px`;
  btn.setAttribute('aria-label', `${p.point_count} races: ${clusterBreakdown(p)}. Click to zoom in.`);
  btn.innerHTML = donutSvg(p);
  const tip = el('span', 'tm-tip');
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
  root.append(el('span', 'tm-pulse'), el('span', 'tm-pin'));
  return root;
}

export function updateSelectionElement(root: HTMLElement, race: Race): void {
  const pin = root.querySelector<HTMLElement>('.tm-pin')!;
  pin.innerHTML = brandGlyphSvg(race.brand, {
    hollow: !!race.nextEdition?.estimated,
    ring: 'var(--tm-marker-ring)',
  });
  root.style.setProperty('--tm-sel-color', BRANDS[race.brand].color);
}

export function hoverRingElement(): HTMLElement {
  const root = el('div', 'tm-hover-ring');
  root.style.zIndex = '25';
  return root;
}

/** Popup content listing races that share one spot (e.g. a full + half on one venue). */
export function clusterPopupContent(races: Race[], onPick: (id: string) => void): HTMLElement {
  const root = el('div', 'tm-popup-list');
  root.append(el('h4', undefined, `${races.length} races at this venue`));
  const ul = el('ul');
  for (const r of races) {
    const li = el('li');
    const b = el('button');
    b.type = 'button';
    const glyph = el('span', 'tm-popup-glyph');
    glyph.innerHTML = brandGlyphSvg(r.brand as BrandId, {
      hollow: !!r.nextEdition?.estimated,
      ring: 'var(--tm-surface)',
    });
    const text = el('span');
    text.append(
      document.createTextNode(`${r.name} · ${DISTANCES[r.distance].label}`),
      el('span', 'tm-popup-meta', raceWhen(r)),
    );
    b.append(glyph, text);
    b.addEventListener('click', () => onPick(r.id));
    li.append(b);
    ul.append(li);
  }
  root.append(ul);
  return root;
}
