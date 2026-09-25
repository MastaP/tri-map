/**
 * Free-text search: accent- and case-insensitive, every query word must match the start
 * of a word in the race's search text (so "kona" does not find "Kikonai" and "usa" does
 * not find "Lusail").
 */

/**
 * Lower-case, strip diacritics and collapse punctuation: "Florianópolis" → "florianopolis",
 * "St. George" → "st george". A dot between digits is kept ("70.3").
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .replace(/[^\p{Letter}\p{Number}.]+/gu, ' ')
    .trim();
}

/** Split a query into normalized tokens; every token must match (AND). */
export function tokenize(query: string): string[] {
  const n = normalizeText(query);
  return n ? n.split(' ') : [];
}

/** A 4-digit year in a query ("roth 2027") filters by edition year instead of text. */
export function isYearToken(token: string): boolean {
  return /^20\d\d$/.test(token);
}

/**
 * Every token must start a word of `haystack` (a normalizeText() string), so a query that
 * is still being typed ("fra") already finds "France" but not "Tafrah".
 */
export function matchesTokens(haystack: string, tokens: readonly string[]): boolean {
  const text = ` ${haystack}`;
  return tokens.every((t) => text.includes(` ${t}`));
}

/** Other names people type for a country, keyed by ISO code. */
export const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  US: ['usa', 'us', 'america', 'united states of america'],
  GB: ['uk', 'gb', 'britain', 'great britain'],
  AE: ['uae', 'emirates'],
  NL: ['holland'],
  CZ: ['czech republic'],
  KR: ['korea'],
  CN: ['prc'],
  TW: ['chinese taipei'],
  ZA: ['rsa'],
  NZ: ['nz', 'aotearoa'],
  AU: ['aus'],
  DE: ['deutschland'],
  ES: ['espana'],
  IT: ['italia'],
  CH: ['schweiz', 'suisse', 'svizzera'],
  AT: ['osterreich', 'oesterreich'],
  MX: ['mexique'],
  BR: ['brasil'],
  DK: ['danmark'],
  SE: ['sverige'],
  NO: ['norge'],
  PL: ['polska'],
  HR: ['hrvatska'],
  TR: ['turkiye'],
};
