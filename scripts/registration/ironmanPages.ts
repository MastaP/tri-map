/**
 * Reading one race on ironman.com, for what the race finder cannot say:
 *
 * - the registration page (https://www.ironman.com/races/<slug>/register) of a race the
 *   finder tags "Flex90 Eligible". That tag only says entries opened less than 90 days
 *   ago; general entry may already be sold out (IRONMAN 70.3 Nice, Tours, Leipzig… in
 *   September 2026). The page's general-entry card shows a price or "SOLD OUT".
 * - the race page (https://www.ironman.com/races/<slug>) of a race that has an announced
 *   next edition but no card in the finder (IRONMAN Wisconsin 2027): its hero shows the
 *   same status tag and date as a finder card would.
 *
 * Both pages carry hidden sections for other states (a stale "OPENING SOON" general-entry
 * card, "Missed out?" banners…), so only visible elements are read (./html.ts). Anything
 * unclear gives no status: a wrong "open" is worse than none.
 */
import { closest, findAll, parseHtml, visibleText, type HtmlElement } from './html.ts';

/** The general entry card: "General entry", "Individual entry", "Regular Entry". */
const GENERAL_CARD = /^(general|individual|regular)\s+entry$/i;
/**
 * Entries that remain when general entry is sold out: IRONMAN Foundation (charity)
 * entries, special or travel-package entries, bundles that include an entry. Not the
 * NIRVANA "Pack" upgrades, which are add-ons for athletes already entered.
 */
const SPECIAL_CARD = /foundation|charity|special\s+entr|travel|package|bundle/i;
/** A banner that says such entries are available: "SOLD OUT | SPECIAL ENTRIES AVAILABLE". */
const SPECIAL_BANNER = /\b(special|charity|foundation|travel|package|bundle)\b[^|]*\bavailable\b/i;

const SOLD_OUT = /^\W*sold[\s-]*out\W*$/i;
const CURRENCY = /[$€£¥₩₹]|\b[A-Z]{3}\b|^R(?=\s?\d)/;
const AMOUNT = /^[^a-z]*\d[^a-z]*$/;

/** "$492.39 USD", "944.50 €", "R4990.52", "CHF 926.58", "US$480.00", "946€": a price. */
export function isPrice(text: string): boolean {
  const t = text.trim();
  return AMOUNT.test(t) && CURRENCY.test(t) && !/SOLD|OPEN|SOON|CLOSED|FULL|WAIT/i.test(t);
}

export function isSoldOutText(text: string): boolean {
  return SOLD_OUT.test(text.trim());
}

export interface PriceCard {
  /** The card's title: "General entry", "RELAY ENTRY", "IRONMAN Foundation Community Fund Entry"… */
  header: string;
  /** What the price line shows: "$492.39 USD", "SOLD OUT", "OPENING SOON"… */
  price: string;
}

const hasClass = (c: string) => (el: HtmlElement) => el.classes.has(c);
const isHeading = (el: HtmlElement) => /^h[1-6]$/.test(el.tag);

/**
 * The visible price cards of a registration page (`.price-card` elements with a
 * `.price-value`), innermost ones only.
 */
export function visiblePriceCards(doc: HtmlElement): PriceCard[] {
  const cards = findAll(doc, hasClass('price-card'), { visibleOnly: true });
  return cards
    .filter((card) => !findAll(card, hasClass('price-card')).length)
    .flatMap((card) => {
      const price = findAll(card, hasClass('price-value'), { visibleOnly: true })[0];
      const header = findAll(card, (el) => isHeading(el) && !el.classes.has('price-value'), { visibleOnly: true })[0];
      if (!price) return [];
      return [{ header: header ? visibleText(header) : '', price: visibleText(price) }];
    });
}

/** The visible headings outside the price cards (banners such as "SOLD OUT | SPECIAL ENTRIES AVAILABLE"). */
export function visibleBanners(doc: HtmlElement): string[] {
  return findAll(doc, isHeading, { visibleOnly: true })
    .filter((h) => !closest(h, hasClass('price-card')))
    .map(visibleText)
    .filter(Boolean);
}

export type RegisterPageStatus = 'open' | 'general-sold-out' | 'sold-out';

export type RegisterPageReading = ({ status: RegisterPageStatus; label: string } | { status: null; reason: string }) & {
  /** The race date in the page's hero ("July 24th, 2027"): which edition the page is about. */
  dateText: string | null;
};

const LABEL_MAX = 200;
const clip = (s: string) => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s);

/**
 * The general-entry status on a race's registration page, from its VISIBLE general-entry
 * card(s) (a page may have one per currency) and the page's own content (the
 * `#block-ironman-content` block when there is one, not the site menus and footer):
 *
 * - a price → "open";
 * - "SOLD OUT", and the page shows entries that remain (a visible "… special entries
 *   available" banner, or a visible IRONMAN Foundation / charity / package / bundle
 *   entry with a price) → "general-sold-out";
 * - "SOLD OUT" otherwise → "sold-out";
 * - anything else (no visible general-entry card, "OPENING SOON", a price in one card and
 *   "SOLD OUT" in another, a visible "sold out" banner next to a price) → no status.
 */
export function readRegisterPage(html: string): RegisterPageReading {
  const doc = parseHtml(html);
  // The page's own content, not the site menus, promos and footer around it.
  const main = findAll(doc, (el) => el.attrs.get('id') === 'block-ironman-content')[0] ?? doc;
  const hero = findAll(main, hasClass('hero'), { visibleOnly: true })[0];
  const date = hero && findAll(hero, hasClass('sub-title'), { visibleOnly: true })[0];
  return { ...readGeneralEntry(main), dateText: (date && visibleText(date)) || null };
}

function readGeneralEntry(
  doc: HtmlElement,
): { status: RegisterPageStatus; label: string } | { status: null; reason: string } {
  const cards = visiblePriceCards(doc);
  const general = cards.filter((c) => GENERAL_CARD.test(c.header));
  if (!general.length) return { status: null, reason: 'no visible general-entry card' };
  const shown = general.map((c) => c.price);
  const odd = shown.filter((p) => !isPrice(p) && !isSoldOutText(p));
  if (odd.length) return { status: null, reason: `general entry shows "${odd[0] || '(nothing)'}"` };
  const banners = visibleBanners(doc);
  const soldOut = shown.filter(isSoldOutText);
  if (!soldOut.length) {
    const contradiction = banners.find((b) => /sold[\s-]*out/i.test(b));
    if (contradiction) return { status: null, reason: `a price, but the page says "${contradiction}"` };
    return { status: 'open', label: clip(`General entry: ${shown.join(' / ')}`) };
  }
  if (soldOut.length < shown.length) {
    return {
      status: null,
      reason: `general entry is sold out in one card and priced in another (${shown.join(', ')})`,
    };
  }
  const banner = banners.find((b) => SPECIAL_BANNER.test(b));
  if (banner) return { status: 'general-sold-out', label: clip(`General entry: SOLD OUT · ${banner}`) };
  const special = cards.find((c) => !GENERAL_CARD.test(c.header) && SPECIAL_CARD.test(c.header) && isPrice(c.price));
  if (special) {
    return { status: 'general-sold-out', label: clip(`General entry: SOLD OUT · ${special.header}: ${special.price}`) };
  }
  return { status: 'sold-out', label: 'General entry: SOLD OUT' };
}

export type RacePageReading = { label: string; dateText: string | null } | { error: string };

/**
 * The status tag and date in a race page's hero (`.race-hero-content`): "Registration
 * Opening Soon", "September 12, 2027". An error when the hero is missing, repeated, or
 * has no tag.
 */
export function readRacePage(html: string): RacePageReading {
  const doc = parseHtml(html);
  const heroes = findAll(doc, hasClass('race-hero-content'), { visibleOnly: true });
  if (heroes.length !== 1) return { error: `${heroes.length} visible race heroes on the page` };
  const hero = heroes[0]!;
  const tag = findAll(hero, hasClass('tag'), { visibleOnly: true })[0];
  const label = tag ? visibleText(tag) : '';
  if (!label) return { error: 'no status tag in the race hero' };
  const date = findAll(hero, (el) => el.tag === 'p' && el.classes.has('date'), { visibleOnly: true })[0];
  return { label, dateText: (date && visibleText(date)) || null };
}
