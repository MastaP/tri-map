import { describe, expect, it } from 'vitest';
import { validateRaceFiles } from '../../src/data/validate.ts';
import { validateRegistrationFiles } from '../../src/data/validateRegistration.ts';
import { fixtureFiles, fixtureRegistrationFiles, TODAY, inTimeZone } from './helpers.ts';

inTimeZone('UTC');

const races = validateRaceFiles(fixtureFiles(), TODAY).races;
const file = (name: string, value: unknown) => ({ name, text: JSON.stringify(value) });
const ironman = (races: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  file('ironman.json', {
    source: 'https://www.ironman.com/races',
    checkedAt: '2026-09-24T12:00:00.000Z',
    races,
    ...extra,
  });
const entry = { status: 'sold-out', label: 'Registration Sold Out', method: 'finder', editionDate: '2026-11-22' };
const errors = (r: ReturnType<typeof validateRegistrationFiles>) =>
  r.issues.filter((i) => i.level === 'error').map((i) => `${i.id ?? ''}: ${i.message}`);

describe('validateRegistrationFiles', () => {
  it('passes the fixture files, warning about the stale file and the status for a past edition', () => {
    const r = validateRegistrationFiles(fixtureRegistrationFiles(), races, TODAY);
    expect(r.errorCount).toBe(0);
    expect(r.issues.map((i) => `${i.file} ${i.id ?? ''}`.trim())).toEqual([
      'ironman.json ironman-da-nang-half',
      't100.json',
    ]);
    expect(Object.keys(r.data).sort()).toEqual(['ironman', 't100']);
  });

  it('rejects unknown race ids and races of another brand', () => {
    const r = validateRegistrationFiles(
      [ironman({ 'ironman-nowhere-full': entry, 't100-dubai-t100': { ...entry, editionDate: '2026-11-14' } })],
      races,
      TODAY,
    );
    expect(errors(r)).toEqual([
      'ironman-nowhere-full: is not the id of any race',
      't100-dubai-t100: is a t100 race: ironman.json only holds ironman races',
    ]);
  });

  it('checks the status values, dates and URLs', () => {
    const r = validateRegistrationFiles(
      [
        ironman({
          'ironman-cozumel-full': { ...entry, status: 'full' },
          'ironman-cascais-half': { ...entry, editionDate: '2026-02-30' },
          'ironman-frankfurt-full': { ...entry, editionDate: '2027-06-27', url: 'http://example.com' },
          'ironman-bahrain-half': { ...entry, editionDate: '2027-12-04', opens: 'soon' },
        }),
      ],
      races,
      TODAY,
    );
    expect(errors(r)).toHaveLength(5); // "soon" is neither YYYY-MM-DD nor a calendar date
    expect(errors(r).join('\n')).toMatch(/status/);
    expect(errors(r).join('\n')).toMatch(/real date/);
    expect(errors(r).join('\n')).toMatch(/https/);
    expect(errors(r).join('\n')).toMatch(/opens/);
  });

  it('rejects a checkedAt in the future or that is not a timestamp, and an entry checked after its file', () => {
    expect(
      errors(validateRegistrationFiles([ironman({}, { checkedAt: '2026-10-01T00:00:00Z' })], races, TODAY)),
    ).toEqual([': checkedAt 2026-10-01T00:00:00Z is in the future']);
    expect(errors(validateRegistrationFiles([ironman({}, { checkedAt: '2026-09-24' })], races, TODAY))).toHaveLength(1);
    expect(
      errors(
        validateRegistrationFiles(
          [ironman({ 'ironman-cozumel-full': { ...entry, checkedAt: '2026-09-24T13:00:00.000Z' } })],
          races,
          TODAY,
        ),
      ),
    ).toEqual([
      "ironman-cozumel-full: checkedAt 2026-09-24T13:00:00.000Z is later than the file's checkedAt 2026-09-24T12:00:00.000Z",
    ]);
  });

  it('warns about stale files and statuses the app cannot show', () => {
    const r = validateRegistrationFiles(
      [
        ironman(
          {
            'ironman-cozumel-full': { status: 'open', label: 'Registration Now Open', method: 'finder' },
            'ironman-cascais-half': { ...entry, editionDate: '2027-10-17' },
            'ironman-frankfurt-full': { ...entry, status: 'open', editionDate: '2027-06-27', opens: '2026-10-01' },
          },
          { checkedAt: '2026-08-01T06:00:00.000Z' },
        ),
      ],
      races,
      TODAY,
    );
    expect(r.errorCount).toBe(0);
    expect(r.issues.map((i) => i.message)).toEqual([
      'checked 55 days ago: the app does not show statuses older than 30 days (npm run refresh:ironman)',
      'has no editionDate, so the app cannot tell which edition it is about (not shown)',
      'status for the edition of 2027-10-17, but the next edition in data/races is 2026-10-18 (not shown)',
      '"opens" only means something for status "opening-soon" (not "open")',
    ]);
  });

  it('warns about an "opening-soon" whose opening date has passed (the app does not show it)', () => {
    const r = validateRegistrationFiles(
      [
        ironman({
          'ironman-south-africa-full': {
            ...entry,
            status: 'opening-soon',
            editionDate: '2027-03-28',
            opens: '2026-09-20',
          },
          'ironman-frankfurt-full': {
            ...entry,
            status: 'opening-soon',
            editionDate: '2027-06-27',
            opens: '2026-09-25',
          },
        }),
      ],
      races,
      TODAY,
    );
    expect(r.errorCount).toBe(0);
    expect(r.issues.map((i) => `${i.id}: ${i.message}`)).toEqual([
      'ironman-south-africa-full: "opening-soon", but it opened on 2026-09-20: not shown until a refresh (npm run refresh:ironman)',
    ]);
  });

  it('requires how each status was read, and a way this file is read', () => {
    const { method: _, ...noMethod } = entry;
    const r = validateRegistrationFiles(
      [
        ironman({
          'ironman-cozumel-full': noMethod,
          'ironman-cascais-half': { ...entry, method: 'guess' },
          'ironman-frankfurt-full': { ...entry, method: 'organiser', editionDate: '2027-06-27' },
          'ironman-bahrain-half': { ...entry, method: 'register-page', editionDate: '2027-12-04' },
        }),
      ],
      races,
      TODAY,
    );
    const list = errors(r);
    expect(list).toHaveLength(2); // a file that fails the schema is not checked further: see the next file
    expect(list.join('\n')).toMatch(/ironman-cozumel-full: races\.ironman-cozumel-full\.method/);
    expect(list.join('\n')).toMatch(/ironman-cascais-half: races\.ironman-cascais-half\.method/);
    expect(
      errors(
        validateRegistrationFiles(
          [
            ironman({
              'ironman-frankfurt-full': { ...entry, method: 'organiser', editionDate: '2027-06-27' },
              'ironman-bahrain-half': { ...entry, method: 'register-page', editionDate: '2027-12-04' },
              'ironman-south-africa-full': { ...entry, method: 'race-page', editionDate: '2027-03-28' },
            }),
          ],
          races,
          TODAY,
        ),
      ),
    ).toEqual(['ironman-frankfurt-full: method "organiser" is not a way ironman.json is read']);
  });

  it('checks the T100 source mapping: T100 race ids and slugs without the year', () => {
    const r = validateRegistrationFiles(
      [
        file('t100-sources.json', {
          't100-dubai-t100': 'dubai-t100',
          'ironman-cozumel-full': 'cozumel',
          't100-nowhere-t100': 'nowhere-t100',
        }),
      ],
      races,
      TODAY,
    );
    expect(errors(r)).toEqual([
      'ironman-cozumel-full: is a ironman race, not a T100 race',
      't100-nowhere-t100: is not the id of any race',
    ]);
    expect(
      errors(
        validateRegistrationFiles([file('t100-sources.json', { 't100-dubai-t100': 'Dubai T100!' })], races, TODAY),
      ),
    ).toHaveLength(1);
  });

  it('reports invalid JSON and ignores unknown files with a warning', () => {
    const r = validateRegistrationFiles(
      [{ name: 'ironman.json', text: '{' }, file('challenge.json', {})],
      races,
      TODAY,
    );
    expect(r.errorCount).toBe(1);
    expect(r.issues.map((i) => i.level)).toEqual(['warning', 'error']);
  });
});
