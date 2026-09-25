/**
 * Minimal RFC 5545 calendar file for one race edition as an all-day event.
 */
import { DISTANCES } from '../data/brands.ts';
import type { Race } from '../data/types.ts';
import { addDays, type ISODate } from './dates.ts';

/** Escape TEXT values (RFC 5545 §3.3.11). */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1), never splitting a UTF-8 sequence. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(current);
      current = '';
      bytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    bytes += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const compactDate = (iso: ISODate) => iso.replace(/-/g, '');

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export interface IcsEdition {
  date: ISODate;
  endDate?: ISODate;
  status: 'confirmed' | 'tentative';
}

/**
 * Stable per race and season, so re-adding a race after its date moved (a TBC date that
 * got confirmed a day later) updates the calendar event instead of adding a second one.
 */
export function icsUid(raceId: string, date: ISODate): string {
  return `${raceId}-${date.slice(0, 4)}@trimap`;
}

/** Increases with every download, so calendars treat a re-import as the newer version. */
export function icsSequence(now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 1000));
}

export function buildIcs(race: Race, edition: IcsEdition, now: Date = new Date(), pageUrl?: string): string {
  const d = DISTANCES[race.distance];
  const end = addDays(edition.endDate ?? edition.date, 1); // DTEND is exclusive for all-day events
  const description = [
    `${d.long}: ${d.swim} km swim · ${d.bike} km bike · ${d.run} km run`,
    race.championship ? race.championship : null,
    edition.status === 'tentative' ? 'Date is tentative, check the official website.' : null,
    `Official website: ${race.url}`,
    pageUrl ? `TriMap: ${pageUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TriMap//Race finder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsUid(race.id, edition.date)}`,
    `SEQUENCE:${icsSequence(now)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDate(edition.date)}`,
    `DTEND;VALUE=DATE:${compactDate(end)}`,
    `SUMMARY:${escapeIcsText(`${race.name} (${d.long})`)}`,
    `LOCATION:${escapeIcsText(`${race.city}, ${race.countryName}`)}`,
    `GEO:${race.lat};${race.lng}`,
    `URL:${race.url}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `STATUS:${edition.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function icsFileName(race: Race, date: ISODate): string {
  return `${race.id}-${date}.ics`;
}
