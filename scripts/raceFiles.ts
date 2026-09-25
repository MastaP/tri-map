/** Node-side helpers to read a race data directory. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SourceFile } from '../src/data/validate.ts';

export const DATA_DIRS = {
  data: 'data/races',
  fixtures: 'tests/fixtures/races',
} as const;

/** Directory selected by VITE_RACE_DATA (`fixtures` → tests/fixtures/races, else data/races). */
export function dataDirFor(source: string | undefined, root = process.cwd()): string {
  return resolve(root, source === 'fixtures' ? DATA_DIRS.fixtures : DATA_DIRS.data);
}

export function readRaceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}
