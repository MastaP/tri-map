import { describe, expect, it } from 'vitest';
import { decodeEntities, findAll, isHidden, parseHtml, visibleText } from '../../scripts/registration/html.ts';
import {
  isPrice,
  isSoldOutText,
  readRacePage,
  readRegisterPage,
  visibleBanners,
  visiblePriceCards,
} from '../../scripts/registration/ironmanPages.ts';
import { registrationSample } from './helpers.ts';

const sample = (name: string) => registrationSample(`ironman/${name}.html`);

describe('parseHtml: what a visitor sees', () => {
  const seen = (html: string) => visibleText(parseHtml(html));

  it('leaves out elements hidden by class, style or attribute, with everything inside them', () => {
    expect(seen('<div class="coh-style-hidden"><h3>OPENING SOON</h3></div><h3>$492.39 USD</h3>')).toBe('$492.39 USD');
    expect(seen('<p style="display: none;">a</p><p style="color:red">b</p>')).toBe('b');
    expect(seen('<p style="visibility:hidden">a</p><p hidden>b</p><span class="visually-hidden">c</span>d')).toBe('d');
    expect(seen('<head><title>Title</title></head><body>x<script>var a = "<div>SOLD OUT</div>";</script></body>')).toBe(
      'x',
    );
  });

  it("reads Cohesion's per-breakpoint classes: hidden only when visible at no breakpoint", () => {
    expect(seen('<div class="coh-hidden-ps coh-hidden-sm coh-visible-xl">desktop</div>')).toBe('desktop');
    expect(seen('<div class="coh-hidden-ps coh-hidden-sm coh-hidden-xl">nowhere</div>ok')).toBe('ok');
  });

  it('closes what HTML closes implicitly, and ignores stray end tags', () => {
    const doc = parseHtml('<div class="a"><p>one<div class="b">two</div></p></span></div><ul><li>x<li>y</ul>');
    const b = findAll(doc, (e) => e.classes.has('b'))[0]!;
    expect(b.parent!.classes.has('a')).toBe(true); // the <div> closed the open <p>
    expect(findAll(doc, (e) => e.tag === 'li').map((li) => li.parent!.tag)).toEqual(['ul', 'ul']);
    expect(visibleText(doc)).toBe('one two x y');
  });

  it('keeps inline text together and separates blocks', () => {
    expect(seen('<h3>US<span>$</span>480.00</h3><p>Individual entry</p>')).toBe('US$480.00 Individual entry');
  });

  it('decodes character references', () => {
    expect(decodeEntities('&amp; &#039; &#x2013; &euro; &nbsp;|&bogus;')).toBe("& ' – €  |&bogus;");
  });

  it('knows when an element sits in a hidden ancestor', () => {
    const doc = parseHtml('<section class="coh-style-hidden"><div class="price-card">x</div></section>');
    const card = findAll(doc, (e) => e.classes.has('price-card'))[0]!;
    expect(isHidden(card)).toBe(true);
    expect(findAll(doc, (e) => e.classes.has('price-card'), { visibleOnly: true })).toEqual([]);
  });
});

describe('prices and "sold out"', () => {
  it('recognises the prices the registration pages show', () => {
    for (const p of ['$492.39 USD', '944.50 €', 'R4990.52', 'CHF 926.58', 'US$480.00', '$ 496.63', '946€', '£752.64']) {
      expect(isPrice(p), p).toBe(true);
    }
    for (const p of ['$1,042.70 USD', 'USD $792', '$1,505 NZD']) expect(isPrice(p), p).toBe(true);
    for (const p of ['SOLD OUT', 'OPENING SOON', 'Fundraise $1,900', '2027', 'Register now', '']) {
      expect(isPrice(p), p).toBe(false);
    }
    expect(isSoldOutText(' SOLD OUT ')).toBe(true);
    expect(isSoldOutText('Sold-out')).toBe(true);
    expect(isSoldOutText('SOLD OUT | SPECIAL ENTRIES AVAILABLE')).toBe(false);
  });
});

describe('readRegisterPage (the Flex90 check)', () => {
  it('open: the visible general-entry card shows a price, although a hidden section still says OPENING SOON', () => {
    const html = sample('register-open-boise');
    expect(html).toContain('OPENING SOON'); // the stale, hidden section
    expect(readRegisterPage(html)).toEqual({
      status: 'open',
      label: 'General entry: $492.39 USD',
      dateText: 'July 24th, 2027',
    });
    const cards = visiblePriceCards(parseHtml(html)).filter((c) => c.header === 'General entry');
    expect(cards.map((c) => c.price)).toEqual(['$492.39 USD']);
  });

  it('general-sold-out: SOLD OUT under a visible "special entries available" banner', () => {
    expect(readRegisterPage(sample('register-special-nice'))).toEqual({
      status: 'general-sold-out',
      label: 'General entry: SOLD OUT · Sold Out | Special Entries Available',
      dateText: 'September 12th, 2027',
    });
  });

  it('general-sold-out: SOLD OUT while IRONMAN Foundation (charity) entries are still on sale', () => {
    expect(readRegisterPage(sample('register-foundation-oregon'))).toEqual({
      status: 'general-sold-out',
      label: 'General entry: SOLD OUT · IRONMAN Foundation Community Fund Entry: $1,320.00 USD',
      dateText: 'July 18th, 2027',
    });
  });

  it('sold-out: SOLD OUT and no other entry left (not the relay, not the add-on packs)', () => {
    const r = readRegisterPage(sample('register-sold-out'));
    expect(r).toEqual({ status: 'sold-out', label: 'General entry: SOLD OUT', dateText: 'July 18th, 2027' });
  });

  it('no status when the page is unclear', () => {
    // Every section shown at once (what reading the raw text would see): OPENING SOON and a price.
    const all = sample('register-open-boise').replaceAll('coh-style-hidden', '');
    expect(readRegisterPage(all)).toMatchObject({ status: null, reason: 'general entry shows "OPENING SOON"' });
    // No general-entry card: a block page, the race finder, an empty page.
    expect(readRegisterPage(sample('block-page'))).toMatchObject({
      status: null,
      reason: 'no visible general-entry card',
    });
    expect(readRegisterPage(sample('races-page-0')).status).toBeNull();
    expect(readRegisterPage('').status).toBeNull();
    const card = (price: string) =>
      `<div class="price-card"><div class="card-header"><h2>General entry</h2></div><h3 class="price-value">${price}</h3></div>`;
    // One currency sold out, the other priced.
    expect(readRegisterPage(card('$421.52 USD') + card('SOLD OUT'))).toMatchObject({
      status: null,
      reason: expect.stringMatching(/sold out in one card and priced in another/),
    });
    // A price, but a visible banner says sold out.
    expect(readRegisterPage(`<h2>REGISTRATION SOLD OUT</h2>${card('$421.52 USD')}`)).toMatchObject({
      status: null,
      reason: 'a price, but the page says "REGISTRATION SOLD OUT"',
    });
    // Only the page's own content counts: a "sold out" heading in the site menu does not.
    expect(
      readRegisterPage(
        `<nav><h2>Sold out races</h2></nav><div id="block-ironman-content">${card('$421.52 USD')}</div>`,
      ),
    ).toMatchObject({ status: 'open' });
    expect(
      readRegisterPage(
        `<nav><h2>Travel packages available</h2></nav><div id="block-ironman-content">${card('SOLD OUT')}</div>`,
      ),
    ).toMatchObject({ status: 'sold-out' });
    expect(readRegisterPage(card('$421.52 USD') + card('$638.14 CAD'))).toMatchObject({
      status: 'open',
      label: 'General entry: $421.52 USD / $638.14 CAD',
    });
  });
});

describe('readRegisterPage on pages that set the state on <body> (registration-state--…)', () => {
  // These pages carry the heading of every state and let CSS show the one the body names;
  // a card's price is replaced by "Sold Out" / "Closed" by its own class or by the body state.
  const page = (state: string | null, ...content: string[]) =>
    `<body${state ? ` class="registration-state--${state}"` : ''}><div id="block-ironman-content">${content.join('')}</div></body>`;
  const headings =
    '<div class="registration-page__heading">' +
    '<div class="registration-page__reg-open"><h1>Registration is open</h1></div>' +
    '<div class="registration-page__reg-general-sold-out"><h1>Special entries available</h1></div>' +
    '<div class="registration-page__reg-sold-out"><h1>Registration sold out</h1></div>' +
    '<div class="registration-page__reg-closed"><h1>Registration closed</h1></div>' +
    '<div class="registration-page__reg-opening-soon"><h1>Registration Opening Soon</h1></div>' +
    '</div>';
  const card = (type: string, header: string, price: string, extra = '') =>
    `<div class="price-card type--${type}${extra}"><div class="card-header"><h2>${header}</h2></div><h3 class="price-value">${price}</h3></div>`;
  const general = (extra = '') => card('general', 'General Entry', '€508.65', extra);
  const relay = card('relay', 'Relay Entry', '€705.33');

  it('open: the body says open and the general-entry card shows a price; the hidden "Registration sold out" heading does not count', () => {
    const html = sample('register-state-open-mamaia');
    expect(html).toContain('Registration sold out');
    expect(readRegisterPage(html)).toEqual({
      status: 'open',
      label: 'General entry: €508.65',
      dateText: 'September 26th, 2027',
    });
    expect(visibleBanners(parseHtml(html))).toContain('Registration is open');
    expect(visibleBanners(parseHtml(html))).not.toContain('Registration sold out');
  });

  it('sold-out: a general-entry card with the sold-out class shows "Sold Out", whatever is left of its price', () => {
    const html = sample('register-card-sold-out-aix');
    const cards = visiblePriceCards(parseHtml(html));
    expect(cards.find((c) => c.header === 'General Entry')?.price).toBe('SOLD OUT');
    expect(readRegisterPage(html)).toEqual({
      status: 'sold-out',
      label: 'General entry: SOLD OUT',
      dateText: 'May 23rd, 2027',
    });
  });

  it('sold-out: the body says sold_out, so the relay price in the markup is not on sale either', () => {
    const html = sample('register-state-sold-out-cascais');
    const cards = visiblePriceCards(parseHtml(html));
    expect(cards.find((c) => c.header === 'Relay Entry')?.price).toBe('SOLD OUT');
    expect(readRegisterPage(html)).toEqual({
      status: 'sold-out',
      label: 'General entry: SOLD OUT',
      dateText: 'October 23rd, 2027',
    });
  });

  it('general-sold-out: the body says general_sold_out and its "Special entries available" heading shows', () => {
    expect(readRegisterPage(page('general_sold_out', headings, general(), relay))).toMatchObject({
      status: 'general-sold-out',
      label: 'General entry: SOLD OUT · Special entries available',
    });
  });

  it('general-sold-out: the general-entry card is sold out while a Foundation entry is priced', () => {
    const foundation = card('foundation', 'IRONMAN Foundation Community Fund Entry', '$1,108.25 USD');
    expect(readRegisterPage(page('open', headings, general(' sold-out'), foundation))).toMatchObject({
      status: 'general-sold-out',
      label: 'General entry: SOLD OUT · IRONMAN Foundation Community Fund Entry: $1,108.25 USD',
    });
    // Under sold_out, the Foundation card is sold out too.
    expect(readRegisterPage(page('sold_out', headings, general(), foundation))).toMatchObject({ status: 'sold-out' });
  });

  it('no status when the body says the race is closed, not open yet, or names a state this script does not know', () => {
    expect(readRegisterPage(page('closed', headings, general()))).toMatchObject({
      status: null,
      reason: 'general entry shows "CLOSED"',
    });
    expect(readRegisterPage(page('opening_soon', headings, general()))).toMatchObject({
      status: null,
      reason: 'the page says registration is opening_soon',
    });
    expect(readRegisterPage(page('paused', headings, general()))).toMatchObject({
      status: null,
      reason: 'the page says registration is paused',
    });
  });

  it('a card class "open" keeps its price even when the body says sold_out (then unclear: no status)', () => {
    const html = page('sold_out', headings, general(' open'));
    expect(visiblePriceCards(parseHtml(html)).map((c) => c.price)).toEqual(['€508.65']);
    expect(readRegisterPage(html)).toMatchObject({
      status: null,
      reason: 'a price, but the page says "Registration sold out"',
    });
  });

  it('without a body state, only the "open" heading shows (as before the change)', () => {
    expect(visibleBanners(parseHtml(page(null, headings)))).toEqual(['Registration is open']);
    expect(readRegisterPage(page(null, headings, general()))).toMatchObject({ status: 'open' });
  });
});

describe('readRacePage (announced races without a finder card)', () => {
  it("reads the hero's status tag and date", () => {
    expect(readRacePage(sample('race-page-wisconsin'))).toEqual({
      label: 'Registration Opening Soon',
      dateText: 'September 12, 2027',
    });
  });

  it('ignores a hidden tag, and refuses a page without exactly one hero or with no tag', () => {
    const hero = (inner: string) => `<div class="race-hero-content">${inner}</div>`;
    expect(
      readRacePage(hero('<span class="tag coh-style-hidden">Old</span><span class="tag">Registration Sold Out</span>')),
    ).toEqual({ label: 'Registration Sold Out', dateText: null });
    expect(readRacePage('<p>nothing</p>')).toEqual({ error: '0 visible race heroes on the page' });
    expect(readRacePage(hero('<span class="tag">A</span>') + hero('<span class="tag">B</span>'))).toEqual({
      error: '2 visible race heroes on the page',
    });
    expect(readRacePage(hero('<p class="date">TBD</p>'))).toEqual({ error: 'no status tag in the race hero' });
  });
});
