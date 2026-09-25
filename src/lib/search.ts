/** Lower-case, strip diacritics and collapse punctuation: "Florianópolis" → "florianopolis". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{Letter}\p{Number}.]+/gu, ' ')
    .trim();
}

/** Split a query into normalized tokens; every token must match (AND). */
export function tokenize(query: string): string[] {
  const n = normalizeText(query);
  return n ? n.split(' ') : [];
}

export function matchesTokens(haystack: string, tokens: readonly string[]): boolean {
  return tokens.every((t) => haystack.includes(t));
}
