/**
 * Parsing and validation of raw race files (zod), used by the tests and the data tools.
 * The browser gets records that were validated at build time (see vite.config.ts) and
 * only runs ./derive.ts.
 */
import type { ISODate } from '../lib/dates.ts';
import { deriveRace, linkSuccessors, UnknownCountryError } from './derive.ts';
import { formatIssuePath, RaceFileSchema, type RaceRecord } from './schema.ts';
import type { Race } from './types.ts';

export { deriveRace, deriveRaces, linkSuccessors } from './derive.ts';

export class RaceDataError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    const shown = problems.slice(0, 25);
    const more = problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : '';
    super(
      `Invalid race data (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n  ${shown.join('\n  ')}${more}\nRun \`npm run validate:data\` for details.`,
    );
    this.name = 'RaceDataError';
    this.problems = problems;
  }
}

/**
 * Validate every file's contents (a bare JSON array of races) and derive the app model.
 * Throws a RaceDataError listing every problem when anything is invalid.
 *
 * @param files map of file path → parsed JSON (e.g. from import.meta.glob)
 */
export function parseRaceFiles(files: Record<string, unknown>, today: ISODate): Race[] {
  const problems: string[] = [];
  const records: RaceRecord[] = [];
  const seen = new Map<string, string>();

  for (const [path, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const file = path.split('/').pop() ?? path;
    const result = RaceFileSchema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const where = formatIssuePath(issue.path);
        const idx = typeof issue.path[0] === 'number' ? issue.path[0] : undefined;
        const id =
          idx !== undefined && Array.isArray(data) && typeof (data[idx] as { id?: unknown })?.id === 'string'
            ? ` (${(data[idx] as { id: string }).id})`
            : '';
        problems.push(`${file}${where ? ` ${where}` : ''}${id}: ${issue.message}`);
      }
      continue;
    }
    for (const race of result.data) {
      const other = seen.get(race.id);
      if (other) {
        problems.push(`${file}: duplicate id "${race.id}" (also in ${other})`);
        continue;
      }
      seen.set(race.id, file);
      records.push(race);
    }
  }

  for (const race of records) {
    if (race.continuedAs !== undefined && !seen.has(race.continuedAs)) {
      problems.push(`${seen.get(race.id)}: ${race.id} continuedAs "${race.continuedAs}", which does not exist`);
    }
  }

  if (problems.length) throw new RaceDataError(problems);
  try {
    return linkSuccessors(records.map((r) => deriveRace(r, today)));
  } catch (e) {
    if (e instanceof UnknownCountryError) throw new RaceDataError([e.message]);
    throw e;
  }
}
