import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText, foldIcsLine, icsFileName } from '../../src/lib/ics.ts';
import { fixtureRaces } from './helpers.ts';

const race = fixtureRaces().find((r) => r.id === 'ironman-frankfurt-full')!;
const now = new Date('2026-09-25T10:20:30.456Z');

describe('ics', () => {
  it('builds an all-day VEVENT with an exclusive DTEND', () => {
    const ics = buildIcs(
      race,
      { date: '2027-06-27', status: 'confirmed' },
      now,
      'https://example.github.io/tri-map/?race=ironman-frankfurt-full',
    );
    const lines = ics.split('\r\n');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTART;VALUE=DATE:20270627');
    expect(lines).toContain('DTEND;VALUE=DATE:20270628');
    expect(lines).toContain('DTSTAMP:20260925T102030Z');
    expect(lines).toContain('UID:ironman-frankfurt-full-2027-06-27@trimap');
    expect(lines).toContain('SUMMARY:IRONMAN Frankfurt (Full distance)');
    expect(lines).toContain('LOCATION:Frankfurt am Main\\, Germany');
    expect(lines).toContain('STATUS:CONFIRMED');
    expect(ics).not.toMatch(/[^\r]\n/); // CRLF only
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it('marks tentative dates and spans multi-day races', () => {
    const ics = buildIcs(race, { date: '2027-06-26', endDate: '2027-06-27', status: 'tentative' }, now);
    expect(ics).toContain('DTEND;VALUE=DATE:20270628');
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('escapes text and folds long lines at 75 octets without splitting characters', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const folded = foldIcsLine(`DESCRIPTION:${'ü'.repeat(60)}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(`DESCRIPTION:${'ü'.repeat(60)}`);
  });

  it('names the file after the race and date', () => {
    expect(icsFileName(race, '2027-06-27')).toBe('ironman-frankfurt-full-2027-06-27.ics');
  });
});
