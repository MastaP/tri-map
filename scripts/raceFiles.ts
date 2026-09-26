/** Node-side helpers to read the race and registration data directories. */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { SourceFile } from '../src/data/validate.ts';

export const DATA_DIRS = {
  data: 'data/races',
  fixtures: 'tests/fixtures/races',
} as const;

export const REGISTRATION_DIRS = {
  data: 'data/registration',
  fixtures: 'tests/fixtures/registration',
} as const;

/** Directory selected by VITE_RACE_DATA (`fixtures` → tests/fixtures/races, else data/races). */
export function dataDirFor(source: string | undefined, root = process.cwd()): string {
  return resolve(root, source === 'fixtures' ? DATA_DIRS.fixtures : DATA_DIRS.data);
}

/** The registration status directory that goes with the race data selected by VITE_RACE_DATA. */
export function registrationDirFor(source: string | undefined, root = process.cwd()): string {
  return resolve(root, source === 'fixtures' ? REGISTRATION_DIRS.fixtures : REGISTRATION_DIRS.data);
}

/** The *.json files directly in `dir` (not in sub-directories), sorted by name. */
export function readRaceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && statSync(join(dir, f)).isFile())
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}

/** The registration files (data/registration/*.json); the same reader, named for its purpose. */
export const readRegistrationFiles = readRaceFiles;

/**
 * Write JSON (2-space indent, trailing newline) through a temporary file and a rename, so
 * an interrupted run never leaves a half-written file behind.
 */
export function writeJsonFile(path: string, value: unknown): void {
  const tmp = join(dirname(path), `.${Date.now()}.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}
