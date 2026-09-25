import type { NextEdition } from '../data/nextEdition.ts';
import { countdown, formatMonthShort, type ISODate } from './dates.ts';

/** "IRONMAN European Championship" → "European Championship" for compact badges. */
export function shortChampionship(s: string): string {
  return s.replace(/^(IRONMAN 70\.3|IRONMAN|Challenge Family|Challenge|T100|PTO)\s+/i, '');
}

/** Countdown to a known next edition; "on now" while a multi-day race is running. */
export function countdownTo(next: Exclude<NextEdition, { estimated: true }>, today: ISODate): string {
  if (next.date < today) return 'on now';
  return countdown(today, next.date);
}

/** "in 5 weeks", or "≈ Jul 2027 · date TBA" for estimates. */
export function whenText(next: NextEdition | null, today: ISODate): string {
  if (!next) return 'No upcoming date';
  if (next.estimated) return `≈ ${formatMonthShort(next.date)} · date TBA`;
  return countdownTo(next, today);
}

/** Shareable link to one race (filters dropped on purpose). */
export function raceLink(id: string, href: string = window.location.href): string {
  const url = new URL(href);
  url.search = `?race=${encodeURIComponent(id)}`;
  url.hash = '';
  return url.toString();
}
