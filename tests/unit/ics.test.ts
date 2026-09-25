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
    expect(lines).toContain('UID:ironman-frankfurt-full-2027@trimap');
    expect(lines).toContain('SEQUENCE:23106030'); // seconds since 2026-01-01
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

  it('keeps the UID when a date moves, and bumps SEQUENCE on a later download', () => {
    const tentative = buildIcs(race, { date: '2027-06-27', status: 'tentative' }, now);
    const confirmed = buildIcs(race, { date: '2027-06-28', status: 'confirmed' }, new Date('2026-10-01T00:00:00Z'));
    const uid = (ics: string) => ics.split('\r\n').find((l) => l.startsWith('UID:'));
    const seq = (ics: string) =>
      Number(
        ics
          .split('\r\n')
          .find((l) => l.startsWith('SEQUENCE:'))!
          .slice(9),
      );
    expect(uid(confirmed)).toBe(uid(tentative));
    expect(seq(confirmed)).toBeGreaterThan(seq(tentative));
  });

  it('describes the official km of a near-standard race', () => {
    const celtman = fixtureRaces().find((r) => r.id === 'independent-celtman-full')!;
    const ics = buildIcs(celtman, { date: '2027-06-19', status: 'confirmed' }, now);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DESCRIPTION:Non-standard full distance: 3.4 km swim · 202 km bike · 41 km run');
    expect(buildIcs(race, { date: '2027-06-27', status: 'confirmed' }, now).replace(/\r\n /g, '')).toContain(
      'DESCRIPTION:Full distance: 3.8 km swim · 180 km bike · 42.2 km run',
    );
  });

  it('names the file after the race and date', () => {
    expect(icsFileName(race, '2027-06-27')).toBe('ironman-frankfurt-full-2027-06-27.ics');
  });
});
