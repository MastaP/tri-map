import type { NextEdition } from '../data/nextEdition.ts';
import type { EntryType, SwimType, Terrain } from '../data/constants.ts';
import { checkedDay, type RaceRegistration, type RegistrationStatus } from '../data/registration.ts';
import type { Race } from '../data/types.ts';
import { countdown, formatDayMonth, formatMonthShort, type ISODate } from './dates.ts';

export const TERRAIN_LABEL: Record<Terrain, string> = {
  flat: 'Flat',
  rolling: 'Rolling',
  hilly: 'Hilly',
  mountainous: 'Mountainous',
};

export const SWIM_LABEL: Record<SwimType, string> = { ocean: 'Sea', lake: 'Lake', river: 'River' };
export const SWIM_LONG: Record<SwimType, string> = {
  ocean: 'Open-water swim in the sea',
  lake: 'Lake swim',
  river: 'River or canal swim',
};

/** Badge text for entry types an age-grouper cannot simply sign up for (open has none). */
export const ENTRY_BADGE: Record<Exclude<EntryType, 'open'>, string> = {
  qualification: 'Qualifier only',
  ballot: 'Ballot',
};

export const ENTRY_EXPLAINER: Record<EntryType, string> = {
  open: 'Open: anyone can sign up on the official website, first come, first served.',
  qualification: 'Qualifier only: you need a qualifying slot, earned at another race.',
  ballot: 'Ballot: places are drawn by lottery or given by application.',
};

/** Compact badge for a registration status (cards, map); open entry needs none. */
export const REGISTRATION_BADGE: Record<Exclude<RegistrationStatus, 'open'>, string> = {
  'opening-soon': 'Opens soon',
  'sold-out': 'Sold out',
  'general-sold-out': 'General entry sold out',
  waitlist: 'Waitlist',
  closed: 'Registration closed',
};

/** A registration status in plain words (race detail). */
export const REGISTRATION_WORDS: Record<RegistrationStatus, string> = {
  open: 'Open',
  'opening-soon': 'Opening soon',
  'sold-out': 'Sold out',
  'general-sold-out': 'General entry sold out',
  waitlist: 'Sold out, waitlist open',
  closed: 'Closed',
};

/** What a registration status means for an age-grouper. */
export const REGISTRATION_EXPLAINER: Record<RegistrationStatus, string> = {
  open: 'You can still enter.',
  'opening-soon': 'Entries are not open yet.',
  'sold-out': 'No entries left.',
  'general-sold-out': 'Charity or travel-package places may remain.',
  waitlist: 'You can join the waitlist for a place.',
  closed: 'Entries are no longer taken.',
};

/** "as of 26 Sep" (with the year when it is not this year's, or with `year`). */
export function asOfText(checkedAt: string, today: ISODate, { year = false }: { year?: boolean } = {}): string {
  const day = checkedDay(checkedAt);
  return `as of ${formatDayMonth(day, { year: year || day.slice(0, 4) !== today.slice(0, 4) })}`;
}

/** "Sold out as of 26 Sep 2026" for tooltips and accessible names. */
export function registrationSummary(reg: RaceRegistration, today: ISODate): string {
  return `${REGISTRATION_WORDS[reg.status]} ${asOfText(reg.checkedAt, today, { year: true })}`;
}

export function isWorldChampionship(title: string): boolean {
  return /\bworld championship/i.test(title);
}

/**
 * A championship title matters to an age-grouper when it means "you have to qualify"
 * (IRONMAN World Championship, 70.3 World Championship): only then is it prominent.
 * Regional titles and a pro tour final held alongside an open race (T100 Qatar) are
 * shown as a quiet tag.
 */
export function isQualifierChampionship(race: Pick<Race, 'championship' | 'entry'>): boolean {
  return !!race.championship && race.entry === 'qualification';
}

/**
 * Series line on cards, named after what an age-grouper enters rather than the pro tour:
 * a T100 World Championship Tour stop is shown as "T100" (the detail names the tour).
 */
export function seriesLabel(race: Pick<Race, 'series' | 'brand'>, brandLabel: string): string {
  if (race.series === 'T100 World Championship Tour') return 'T100';
  return race.series ?? brandLabel;
}

/** "Mountainous bike, flat run" style summary for aria labels; '' when unknown. */
export function courseSummary(race: Pick<Race, 'bike' | 'run'>): string {
  const parts: string[] = [];
  if (race.bike) parts.push(`${TERRAIN_LABEL[race.bike].toLowerCase()} bike`);
  if (race.run) parts.push(`${TERRAIN_LABEL[race.run].toLowerCase()} run`);
  return parts.join(', ');
}

/** Year from which the successor race is held (its first edition that is not cancelled). */
export function firstYear(race: Pick<Race, 'editions'>): string | null {
  const first = race.editions.find((e) => e.status !== 'cancelled') ?? race.editions[0];
  return first ? first.date.slice(0, 4) : null;
}

/**
 * "IRONMAN European Championship" → "European Championship", "T100 Triathlon World
 * Championship Final" → "World Championship Final", for compact badges.
 */
export function shortChampionship(s: string): string {
  return s.replace(/^(IRONMAN 70\.3|IRONMAN|Challenge Family|Challenge|T100|PTO)\s+(Triathlon\s+)?/i, '');
}

/** Countdown to a known next edition; "on now" while a multi-day race is running. */
export function countdownTo(next: Exclude<NextEdition, { estimated: true }>, today: ISODate): string {
  if (next.date < today) return 'on now';
  return countdown(today, next.date);
}

/**
 * "12 more races usually held in this period have no date announced yet." for races
 * hidden while estimated dates are off. `more`: some races are listed already.
 */
export function estimatedHiddenText(n: number, inPeriod: boolean, more = true): string {
  const races = `${n}${more ? ' more' : ''} ${n === 1 ? 'race' : 'races'}`;
  const period = inPeriod ? ' usually held in this period' : '';
  return `${races}${period} ${n === 1 ? 'has' : 'have'} no date announced yet.`;
}

/** "in 5 weeks", or "≈ Jul 2027 · date TBA" for estimates. */
export function whenText(next: NextEdition | null, today: ISODate): string {
  if (!next) return 'No upcoming date';
  if (next.estimated) return `≈ ${formatMonthShort(next.date)} · date TBA`;
  return countdownTo(next, today);
}

/**
 * Shareable link to one race (filters dropped on purpose). With `page`, the link points at
 * the race's own small page (race/<id>/, generated at build time), whose title and
 * preview tags name the race when the link is pasted into a chat; it forwards to the app.
 */
export function raceLink(id: string, href: string = window.location.href, { page = false } = {}): string {
  const url = new URL(href);
  url.hash = '';
  if (page) {
    url.search = '';
    url.pathname = `${url.pathname.replace(/[^/]*$/, '')}race/${encodeURIComponent(id)}/`;
    return url.toString();
  }
  url.search = `?race=${encodeURIComponent(id)}`;
  return url.toString();
}

/**
 * A sibling race's name without the brand word both share ("IRONMAN 70.3 World
 * Championship" next to "IRONMAN Chattanooga" → "70.3 World Championship").
 */
export function shortRaceName(race: Pick<Race, 'name'>, context: Pick<Race, 'name'>): string {
  const first = context.name.split(' ')[0]!;
  return race.name.startsWith(`${first} `) && race.name !== context.name
    ? race.name.slice(first.length + 1)
    : race.name;
}

/**
 * Link texts for source URLs: the host name, plus the last path segment when the same host
 * appears more than once ("ironman.com/im-chattanooga", "ironman.com/results").
 * Duplicate URLs are dropped.
 */
export function sourceLabels(sources: readonly string[]): { url: string; label: string }[] {
  const urls = [...new Set(sources)];
  const parsed = urls.map((url) => {
    try {
      const u = new URL(url);
      const segment = u.pathname.split('/').filter(Boolean).at(-1) ?? '';
      return { url, host: u.hostname.replace(/^www\./, ''), segment: decodeURIComponent(segment) };
    } catch {
      return { url, host: url, segment: '' };
    }
  });
  const count = new Map<string, number>();
  for (const p of parsed) count.set(p.host, (count.get(p.host) ?? 0) + 1);
  return parsed.map(({ url, host, segment }) => {
    if ((count.get(host) ?? 0) < 2 || !segment) return { url, label: host };
    const short = segment.length > 28 ? `${segment.slice(0, 27)}…` : segment;
    return { url, label: `${host}/${short}` };
  });
}
