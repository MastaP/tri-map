import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseRaceFiles } from '../../src/data/parse.ts';
import type { RaceRecord } from '../../src/data/schema.ts';
import type { SourceFile } from '../../src/data/validate.ts';

export const TODAY = '2026-09-25';
export const FIXTURE_DIR = join(import.meta.dirname, '..', 'fixtures', 'races');

export function fixtureFiles(): SourceFile[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((name) => ({ name, text: readFileSync(join(FIXTURE_DIR, name), 'utf8') }));
}

export function fixtureModules(): Record<string, unknown> {
  return Object.fromEntries(fixtureFiles().map((f) => [`/tests/fixtures/races/${f.name}`, JSON.parse(f.text)]));
}

export function fixtureRaces(today = TODAY) {
  return parseRaceFiles(fixtureModules(), today);
}

export function makeRecord(overrides: Partial<RaceRecord> = {}): RaceRecord {
  return {
    id: 'ironman-testville-full',
    name: 'IRONMAN Testville',
    brand: 'ironman',
    series: 'IRONMAN',
    distance: 'full',
    city: 'Testville',
    country: 'DE',
    lat: 50.1234,
    lng: 8.5678,
    url: 'https://example.com/race',
    editions: [{ date: '2027-06-27', status: 'confirmed' }],
    sources: ['https://example.com/race'],
    verifiedAt: '2026-09-20',
    ...overrides,
  };
}
