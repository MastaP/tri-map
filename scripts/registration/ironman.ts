/**
 * IRONMAN registration status from ironman.com:
 *
 * 1. the race finder (https://www.ironman.com/races?page=0, 1, …): server-rendered pages
 *    of race cards, each with the race page link, the next race date and a status tag
 *    such as "Registration Sold Out";
 * 2. for a card tagged "Flex90 Eligible" (entries opened less than 90 days ago, which says
 *    nothing about places left), the race's registration page, whose visible general-entry
 *    card shows a price or "SOLD OUT" (./ironmanPages.ts);
 * 3. for a race with an announced next edition but no card, the race page's status tag.
 *
 * Pure parsing and matching here; scripts/refresh-ironman.ts does the requests (through
 * scripts/registration/run.ts). The pages answer an honest User-Agent from a normal
 * connection but block GitHub-hosted runners (Cloudflare), so this runs by hand, never in
 * CI, and never tries to get round a block.
 */
import {
  editionMatches,
  REGISTRATION_STATUSES,
  type RegistrationEntry,
  type RegistrationFile,
  type RegistrationStatus,
} from '../../src/data/registration.ts';
import type { Race } from '../../src/data/types.ts';
import type { ISODate } from '../../src/lib/dates.ts';
import { countBy, fileErrors, MIN_MATCH_SHARE, sortedEntries, type Fetcher } from './common.ts';
import { decodeEntities } from './html.ts';
import { readRacePage, readRegisterPage } from './ironmanPages.ts';

export const IRONMAN_ORIGIN = 'https://www.ironman.com';
export const IRONMAN_LISTING = `${IRONMAN_ORIGIN}/races`;
export const ironmanPageUrl = (page: number) => `${IRONMAN_LISTING}?page=${page}`;

/** Stop walking the pages here even if cards keep coming (the finder has ~23). */
export const MAX_PAGES = 60;

export interface IronmanCard {
  /** Race page, absolute (https://www.ironman.com/races/im-leeds). */
  url: string;
  title: string;
  /** The status tag, as shown ("Registration Sold Out"); null when the card has none. */
  label: string | null;
  /** "August 15, 2027", "September 12–13, 2026"; null when the card has none. */
  dateText: string | null;
}

/** Text content of an HTML fragment: tags dropped, entities decoded, whitespace collapsed. */
export function htmlText(fragment: string | undefined): string {
  if (!fragment) return '';
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Each card sits in its own `races-search-view__cards-row` container. */
const CARD_SPLIT = 'races-search-view__cards-row';
/** The card ends with its "See Race Details" link to the race page. */
const DETAILS_LINK = /<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*See Race Details/i;
const TAG = /<span\b[^>]*\bclass="[^"]*\btag\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
const DATE = /<span\b[^>]*\bclass="[^"]*\bdate\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
const TITLE = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i;

/** The race cards on one race-finder page (none on the page after the last). */
export function parseIronmanPage(html: string): IronmanCard[] {
  const cards: IronmanCard[] = [];
  for (const raw of html.split(CARD_SPLIT).slice(1)) {
    const link = DETAILS_LINK.exec(raw);
    // Only look inside the card: what follows its link is the next card or the page footer.
    const card = link ? raw.slice(0, link.index + link[0].length) : raw;
    const href = link?.[1] ?? /\bhref="([^"]*\/races\/[^"]+)"/i.exec(card)?.[1];
    if (!href) continue;
    let url: string;
    try {
      const u = new URL(htmlText(href), IRONMAN_ORIGIN);
      if (u.protocol === 'http:') u.protocol = 'https:';
      url = u.toString();
    } catch {
      continue;
    }
    cards.push({
      url,
      title: htmlText(TITLE.exec(card)?.[1]),
      label: htmlText(TAG.exec(card)?.[1]) || null,
      dateText: htmlText(DATE.exec(card)?.[1]) || null,
    });
  }
  return cards;
}

/** A Cloudflare challenge or block page served instead of the listing. */
export function isBlockPage(html: string): boolean {
  return /<title>\s*(Just a moment|Attention Required)|cf_chl_opt|id="cf-(chl|error)/i.test(html);
}

/**
 * What each race-finder tag means for an age-grouper. "skip": not a registration status
 * (the entry rule, which data/races already has as `entry`).
 *
 * - "Flex90 Eligible": registration opened less than 90 days ago, when IRONMAN's Flex90
 *   transfer/deferral benefits apply (ironman.com/resources/rules-and-policies/flex-90).
 *   The finder shows it instead of "Registration Now Open" even when general entry has
 *   sold out since, so it is only a candidate "open": refreshIronman checks the race's
 *   registration page and keeps no status when that page does not say (isFlex90).
 * - "General Registration Sold Out": general entry is gone; charity and travel-package
 *   places may remain.
 * - "Race Weekend": the race is days away; online entry is over.
 */
export const IRONMAN_LABELS: Readonly<Record<string, RegistrationStatus | 'skip'>> = {
  'registration now open': 'open',
  'flex90 eligible': 'open',
  'registration opening soon': 'opening-soon',
  'registration sold out': 'sold-out',
  'sold out': 'sold-out',
  'general registration sold out': 'general-sold-out',
  'registration closed': 'closed',
  closed: 'closed',
  'race weekend': 'closed',
  'by qualification only': 'skip',
};

const normalizeLabel = (label: string) => label.replace(/\s+/g, ' ').trim().toLowerCase();

/** The status for a tag; 'skip' for tags that are no status; null for tags we do not know. */
export function ironmanStatus(label: string): RegistrationStatus | 'skip' | null {
  return IRONMAN_LABELS[normalizeLabel(label)] ?? null;
}

/** "Flex90 Eligible": open by the tag, but general entry may be sold out (see IRONMAN_LABELS). */
export function isFlex90(label: string | null | undefined): boolean {
  return !!label && normalizeLabel(label) === 'flex90 eligible';
}

/** The registration page of a race page: https://www.ironman.com/races/im703-nice/register. */
export function registerPageUrl(raceUrl: string): string {
  const u = new URL(raceUrl, IRONMAN_ORIGIN);
  u.search = '';
  u.hash = '';
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/register`;
  if (u.protocol === 'http:') u.protocol = 'https:';
  return u.toString();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CARD_DATE =
  /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–—-]\s*(?:[a-z]+\.?\s+)?\d{1,2}(?:st|nd|rd|th)?)?,?\s+(\d{4})$/i;

/**
 * The (first) day of a card date: "October 4, 2026" → 2026-10-04, "September 12–13, 2026"
 * → 2026-09-12, "July 24th, 2027" (registration pages) → 2027-07-24. Only the year
 * ("2027") when the rest cannot be read; undefined without one.
 */
export function parseCardDate(text: string | null): string | undefined {
  if (!text) return undefined;
  const m = CARD_DATE.exec(text.trim());
  if (m) {
    const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    const day = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (month >= 0 && d.getUTCMonth() === month && d.getUTCDate() === day) return d.toISOString().slice(0, 10);
  }
  return /\b(20\d\d)\b/.exec(text)?.[1];
}

/** URL identity for matching cards to data/races: host without www, path, no case, no trailing slash. */
export function normalizeRaceUrl(url: string): string {
  try {
    const u = new URL(url, IRONMAN_ORIGIN);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Short course (5150) races: on the finder, not in TriMap. */
export function isIgnoredCard(card: IronmanCard): boolean {
  return /\/races\/5150-/i.test(new URL(card.url).pathname);
}

export interface IronmanMatch {
  /** Race id → status entry. */
  entries: Record<string, RegistrationEntry>;
  /** Cards of races TriMap does not have (and that are not ignored on purpose). */
  unmatched: IronmanCard[];
  /** Cards ignored on purpose (5150 short course). */
  ignored: IronmanCard[];
  /** Cards whose tag is not a status ("By Qualification Only"). */
  skipped: { card: IronmanCard; raceIds: string[] }[];
  /** Cards with a tag this script does not know, or none: no status written. */
  unknownLabel: IronmanCard[];
  /** Listed IRONMAN races (with a next edition) that no card matched. */
  withoutCard: Race[];
  /** Entries about another edition than the race's next one in data/races: the app will not show them. */
  otherEdition: { race: Race; editionDate: string | undefined }[];
  /** Cards for a race that already had one (the first wins). */
  duplicates: IronmanCard[];
}

/** Match race-finder cards to data/races by the race's `url`. */
export function matchIronmanCards(cards: readonly IronmanCard[], races: readonly Race[]): IronmanMatch {
  const byUrl = new Map<string, Race[]>();
  for (const r of races) {
    const key = normalizeRaceUrl(r.url);
    byUrl.set(key, [...(byUrl.get(key) ?? []), r]);
  }
  const out: IronmanMatch = {
    entries: {},
    unmatched: [],
    ignored: [],
    skipped: [],
    unknownLabel: [],
    withoutCard: [],
    otherEdition: [],
    duplicates: [],
  };
  const carded = new Set<string>();
  for (const card of cards) {
    if (isIgnoredCard(card)) {
      out.ignored.push(card);
      continue;
    }
    const matched = byUrl.get(normalizeRaceUrl(card.url)) ?? [];
    if (!matched.length) {
      out.unmatched.push(card);
      continue;
    }
    if (matched.some((r) => carded.has(r.id))) {
      out.duplicates.push(card);
      continue;
    }
    for (const r of matched) carded.add(r.id);
    const status = card.label ? ironmanStatus(card.label) : null;
    if (status === 'skip') {
      out.skipped.push({ card, raceIds: matched.map((r) => r.id) });
      continue;
    }
    if (!status) {
      out.unknownLabel.push(card);
      continue;
    }
    const editionDate = parseCardDate(card.dateText);
    for (const r of matched) {
      out.entries[r.id] = {
        status,
        label: card.label!,
        method: 'finder',
        ...(editionDate ? { editionDate } : {}),
        url: card.url,
      };
    }
  }
  out.otherEdition = otherEditions(out.entries, races);
  out.withoutCard = races.filter((r) => r.brand === 'ironman' && r.nextEdition && !carded.has(r.id));
  return out;
}

/** Entries about another edition than the race's next one in data/races (the app will not show them). */
export function otherEditions(
  entries: Record<string, RegistrationEntry>,
  races: readonly Race[],
): { race: Race; editionDate: string | undefined }[] {
  const byId = new Map(races.map((r) => [r.id, r]));
  return Object.entries(entries).flatMap(([id, entry]) => {
    const race = byId.get(id);
    const date = entry.editionDate;
    if (!race) return [];
    return !race.nextEdition || !date || !editionMatches(date, race.nextEdition) ? [{ race, editionDate: date }] : [];
  });
}

/** One race page or registration page read after the finder (see refreshIronman). */
export interface PageCheck {
  kind: 'register-page' | 'race-page';
  url: string;
  raceIds: string[];
  /** The status written; null when none was. */
  status: RegistrationStatus | null;
  /** The page's own wording, when it gave a status. */
  label?: string;
  /** Why no status was written. */
  reason?: string;
}

export interface IronmanRefresh {
  ok: boolean;
  /** Why nothing may be written (when !ok). */
  error?: string;
  pages: number;
  cards: IronmanCard[];
  match?: IronmanMatch;
  /** The registration pages (Flex90 cards) and race pages (no card) read after the finder. */
  checks: PageCheck[];
  file?: RegistrationFile;
}

type PageFetch = { html: string } | { reason: string };

/**
 * One request for a race or registration page. After a rate limit (HTTP 429 once the
 * fetcher's own waiting gave up) or a block, the remaining pages are not requested at
 * all: pushing on would only make it worse, and those races simply get no status.
 */
function pageFetcher(fetcher: Fetcher): (url: string) => Promise<PageFetch> {
  let stopped: string | null = null;
  return async (url) => {
    if (stopped) return { reason: `not requested (${stopped} earlier in this run)` };
    let res;
    try {
      res = await fetcher(url);
    } catch (e) {
      return { reason: `request failed (${(e as Error).message})` };
    }
    if (res.status === 429) {
      stopped = 'rate limited';
      return { reason: 'HTTP 429 (rate limited)' };
    }
    if (res.status === 403 || isBlockPage(res.text)) {
      stopped = 'blocked';
      return { reason: `HTTP ${res.status} (blocked: a Cloudflare challenge?)` };
    }
    if (res.status !== 200) return { reason: `HTTP ${res.status}` };
    return { html: res.text };
  };
}

/** Group race ids by a key (a url), keeping the first-seen order. */
function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups];
}

/**
 * Races with an announced (not estimated) next edition and no card: read the status tag
 * and date in the race page's hero. Written only when the page's date is the race's next
 * edition, so a page about another year never lands on this one.
 */
async function checkRacePages(
  get: (url: string) => Promise<PageFetch>,
  withoutCard: readonly Race[],
  entries: Record<string, RegistrationEntry>,
): Promise<PageCheck[]> {
  const announced = withoutCard.filter((r) => r.nextEdition && !r.nextEdition.estimated);
  const checks: PageCheck[] = [];
  for (const [, group] of groupBy(announced, (r) => normalizeRaceUrl(r.url))) {
    const url = new URL(group[0]!.url, IRONMAN_ORIGIN).toString().replace(/^http:/, 'https:');
    const raceIds = group.map((r) => r.id);
    const none = (reason: string, ids = raceIds) =>
      checks.push({ kind: 'race-page', url, raceIds: ids, status: null, reason });
    // Only ironman.com race pages: this reads their markup, and asks nothing of other sites.
    if (!/(^|\.)ironman\.com$/i.test(new URL(url).hostname)) {
      none('not an ironman.com race page');
      continue;
    }
    const page = await get(url);
    if ('reason' in page) {
      none(page.reason);
      continue;
    }
    const hero = readRacePage(page.html);
    if ('error' in hero) {
      none(hero.error);
      continue;
    }
    const status = ironmanStatus(hero.label);
    if (status === 'skip' || !status) {
      none(status === 'skip' ? `tag "${hero.label}" is no status` : `unknown tag "${hero.label}"`);
      continue;
    }
    const editionDate = parseCardDate(hero.dateText);
    const matching = group.filter((r) => editionDate && editionMatches(editionDate, r.nextEdition!));
    if (!matching.length) {
      none(`the page's date "${hero.dateText ?? ''}" is not the next edition (${group[0]!.nextEdition!.date})`);
      continue;
    }
    for (const r of matching) {
      entries[r.id] = { status, label: hero.label, method: 'race-page', editionDate: editionDate!, url };
    }
    checks.push({ kind: 'race-page', url, raceIds: matching.map((r) => r.id), status, label: hero.label });
    const others = group.filter((r) => !matching.includes(r));
    if (others.length) {
      none(
        `the page's date "${hero.dateText ?? ''}" is not the next edition`,
        others.map((r) => r.id),
      );
    }
  }
  return checks;
}

/**
 * Entries whose tag is "Flex90 Eligible": read the race's registration page and replace
 * the entry with what its visible general-entry card says (open, general-sold-out or
 * sold-out), or drop it when the page cannot be read, says nothing clear, or is about
 * another edition than the card (its hero date).
 */
async function checkFlex90(
  get: (url: string) => Promise<PageFetch>,
  entries: Record<string, RegistrationEntry>,
): Promise<PageCheck[]> {
  const flex = Object.entries(entries).filter(([, e]) => isFlex90(e.label));
  const checks: PageCheck[] = [];
  for (const [, group] of groupBy(flex, ([, e]) => normalizeRaceUrl(e.url ?? ''))) {
    const first = group[0]![1];
    const url = registerPageUrl(first.url!);
    const raceIds = group.map(([id]) => id);
    const none = (reason: string) => {
      for (const id of raceIds) delete entries[id];
      checks.push({ kind: 'register-page', url, raceIds, status: null, reason });
    };
    const page = await get(url);
    if ('reason' in page) {
      none(page.reason);
      continue;
    }
    const reading = readRegisterPage(page.html);
    if (!reading.status) {
      none(reading.reason);
      continue;
    }
    const pageDate = parseCardDate(reading.dateText);
    const cardDate = first.editionDate;
    if (pageDate && cardDate && !sameEdition(pageDate, cardDate)) {
      none(`the page is about ${pageDate}, the card about ${cardDate}`);
      continue;
    }
    for (const [id, e] of group) {
      const editionDate = e.editionDate ?? pageDate;
      entries[id] = {
        status: reading.status,
        label: reading.label,
        method: 'register-page',
        ...(editionDate ? { editionDate } : {}),
        url,
      };
    }
    checks.push({ kind: 'register-page', url, raceIds, status: reading.status, label: reading.label });
  }
  return checks;
}

/** Two edition dates (YYYY-MM-DD or YYYY) of the same edition: within EDITION_MATCH_DAYS, or the same year. */
function sameEdition(a: string, b: string): boolean {
  if (a.length === 4 || b.length === 4) return a.slice(0, 4) === b.slice(0, 4);
  return editionMatches(a, { date: b, estimated: false });
}

/**
 * Walk the race finder page by page until a page has no cards, match the cards, check
 * the Flex90 cards' registration pages and the race pages of announced races without a
 * card, then build the new file. Refuses (ok: false) on an HTTP error or block page in
 * the finder, no cards at all, a file that would not validate, or a status for fewer than
 * MIN_MATCH_SHARE of the listed IRONMAN races, so a broken run never replaces good data.
 * A race or registration page that cannot be read only costs that race its status.
 */
export async function refreshIronman({
  fetcher,
  races,
  now,
  today,
}: {
  fetcher: Fetcher;
  races: readonly Race[];
  now: Date;
  today: ISODate;
}): Promise<IronmanRefresh> {
  const cards: IronmanCard[] = [];
  const checks: PageCheck[] = [];
  const seen = new Set<string>();
  let page = 0;
  for (; page < MAX_PAGES; page++) {
    const url = ironmanPageUrl(page);
    let res;
    try {
      res = await fetcher(url);
    } catch (e) {
      return { ok: false, error: `${url}: request failed (${(e as Error).message})`, pages: page, cards, checks };
    }
    if (res.status !== 200 || isBlockPage(res.text)) {
      const why =
        res.status === 429
          ? ' (rate limited: try again later)'
          : res.status === 403 || isBlockPage(res.text)
            ? ' (blocked: a Cloudflare challenge?)'
            : '';
      return { ok: false, error: `${url}: HTTP ${res.status}${why}`, pages: page, cards, checks };
    }
    const found = parseIronmanPage(res.text);
    const fresh = found.filter((c) => !seen.has(c.url));
    // The page after the last has no cards; a page that only repeats earlier cards ends it too.
    if (!fresh.length) break;
    for (const c of fresh) seen.add(c.url);
    cards.push(...fresh);
  }
  if (!cards.length) {
    return { ok: false, error: 'no race cards found: has the race finder page changed?', pages: page, cards, checks };
  }
  const match = matchIronmanCards(cards, races);
  const get = pageFetcher(fetcher);
  // Race pages first: one may say "Flex90 Eligible" too, and then gets its registration page checked.
  checks.push(...(await checkRacePages(get, match.withoutCard, match.entries)));
  checks.push(...(await checkFlex90(get, match.entries)));
  match.otherEdition = otherEditions(match.entries, races);

  const listed = races.filter((r) => r.brand === 'ironman' && r.nextEdition).length;
  const matched = Object.keys(match.entries).length;
  if (!listed || matched < listed * MIN_MATCH_SHARE) {
    return {
      ok: false,
      error: `only ${matched} of ${listed} listed IRONMAN races got a status (needs ${Math.round(MIN_MATCH_SHARE * 100)}%): has the race finder page changed, or were the registration pages rate limited?`,
      pages: page,
      cards,
      match,
      checks,
    };
  }
  const file: RegistrationFile = {
    source: IRONMAN_LISTING,
    checkedAt: now.toISOString(),
    races: sortedEntries(match.entries),
  };
  const errors = fileErrors('ironman.json', file, races, today);
  if (errors.length) {
    return {
      ok: false,
      error: `the new file would not validate: ${errors.map((e) => `${e.id ?? ''} ${e.message}`.trim()).join('; ')}`,
      pages: page,
      cards,
      match,
      checks,
    };
  }
  return { ok: true, pages: page, cards, match, checks, file };
}

/** The refresh summary printed by `npm run refresh:ironman`. */
export function ironmanSummary(r: IronmanRefresh): string {
  const lines: string[] = [];
  lines.push(`${r.cards.length} race cards on ${r.pages} pages.`);
  const m = r.match;
  if (!m) return lines.join('\n');
  const entries = Object.values(m.entries);
  lines.push(
    `${entries.length} TriMap races with a status: ${countBy(
      entries.map((e) => e.status),
      REGISTRATION_STATUSES,
    )}.`,
  );
  const card = (c: IronmanCard) =>
    `    ${c.title || '(no title)'} · ${c.dateText ?? 'no date'} · ${c.label ?? 'no tag'} · ${c.url}`;
  const check = (c: PageCheck) =>
    `    ${c.raceIds.join(', ')}: ${c.status ? `${c.status} (${c.label})` : `no status: ${c.reason}`} · ${c.url}`;
  for (const kind of ['register-page', 'race-page'] as const) {
    const done = r.checks.filter((c) => c.kind === kind);
    if (!done.length) continue;
    const given = done.filter((c) => c.status);
    const races = (list: PageCheck[]) => list.reduce((n, c) => n + c.raceIds.length, 0);
    lines.push(
      kind === 'register-page'
        ? `${done.length} "Flex90 Eligible" cards checked on their registration page: ${
            countBy(
              given.flatMap((c) => c.raceIds.map(() => c.status!)),
              REGISTRATION_STATUSES,
            ) || 'no status'
          }${given.length < done.length ? `; ${races(done.filter((c) => !c.status))} races left without a status` : ''}.`
        : `${done.length} race pages checked (announced next edition, no card):`,
    );
    const shown = kind === 'register-page' ? done.filter((c) => c.status !== 'open') : done;
    lines.push(...shown.map(check));
  }
  if (m.ignored.length) lines.push(`${m.ignored.length} short-course (5150) cards ignored.`);
  if (m.skipped.length) {
    lines.push(`${m.skipped.length} cards whose tag is no status (entry rule), not written:`);
    lines.push(...m.skipped.map((s) => card(s.card)));
  }
  if (m.unknownLabel.length) {
    lines.push(`${m.unknownLabel.length} cards with a tag this script does not know (add it to IRONMAN_LABELS):`);
    lines.push(...m.unknownLabel.map(card));
  }
  if (m.unmatched.length) {
    lines.push(`${m.unmatched.length} cards with no race in data/races (a new race, or a changed url?):`);
    lines.push(...m.unmatched.map(card));
  }
  if (m.duplicates.length) {
    lines.push(`${m.duplicates.length} more cards for a race that already had one (ignored):`);
    lines.push(...m.duplicates.map(card));
  }
  const noCard = m.withoutCard.filter((race) => !m.entries[race.id]);
  if (noCard.length) {
    lines.push(`${noCard.length} listed IRONMAN races with no card and no status:`);
    lines.push(
      ...noCard.map(
        (race) =>
          `    ${race.id} · ${race.nextEdition?.estimated ? 'estimated' : 'announced'} next edition · ${race.url}`,
      ),
    );
  }
  if (m.otherEdition.length) {
    lines.push(
      `${m.otherEdition.length} statuses about another edition than the next one in data/races (not shown; check the dates):`,
    );
    lines.push(
      ...m.otherEdition.map(
        ({ race, editionDate }) =>
          `    ${race.id}: status for ${editionDate ?? 'no date'}, next edition ${race.nextEdition?.date ?? 'none'}`,
      ),
    );
  }
  return lines.join('\n');
}
