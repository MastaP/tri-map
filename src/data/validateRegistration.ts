/**
 * Validation of the registration status files in data/registration (data/README.md,
 * "Registration status"), used by `npm run validate:data`, the build (vite.config.ts) and
 * the refresh scripts before they write. Pure: takes file names + raw text and the
 * validated races, returns issues. Errors fail CI and the build; warnings are advisory.
 */
import { z } from 'zod';
import { addDays, daysBetween, type ISODate } from '../lib/dates.ts';
import {
  checkedDay,
  editionMatches,
  isOverdue,
  REGISTRATION_MAX_AGE_DAYS,
  REGISTRATION_METHOD_INFO,
  REGISTRATION_METHODS,
  REGISTRATION_SOURCES,
  REGISTRATION_STATUSES,
  type RegistrationData,
  type RegistrationSourceId,
} from './registration.ts';
import { formatIssuePath, httpsUrl, ID_PATTERN, isoDate } from './schema.ts';
import type { Race } from './types.ts';
import type { Issue, IssueLevel, SourceFile } from './validate.ts';

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** An ISO 8601 UTC timestamp such as 2026-09-26T05:12:03.000Z. */
export const isoTimestamp = z
  .string()
  .regex(ISO_TIMESTAMP, 'must be an ISO 8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)')
  .refine((s) => {
    const t = Date.parse(s);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s.slice(0, 10);
  }, 'is not a real date and time');

const editionDate = z
  .string()
  .refine(
    (s) => /^\d{4}$/.test(s) || isoDate.safeParse(s).success,
    'must be a real date (YYYY-MM-DD), or a year (YYYY) when only the year is known',
  );

export const RegistrationEntrySchema = z.strictObject({
  status: z.enum(REGISTRATION_STATUSES),
  label: z.string().trim().min(1).max(200),
  method: z.enum(REGISTRATION_METHODS),
  editionDate: editionDate.optional(),
  url: httpsUrl.optional(),
  opens: isoDate.optional(),
  checkedAt: isoTimestamp.optional(),
});

export const RegistrationFileSchema = z.strictObject({
  source: httpsUrl,
  checkedAt: isoTimestamp,
  races: z.record(z.string().regex(ID_PATTERN, 'must be a race id'), RegistrationEntrySchema),
});

/** Event slug on the PTO entry platform without the year, e.g. "london-t100" (→ london-t100-2027). */
export const T100_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const T100SourcesSchema = z.record(
  z.string().regex(ID_PATTERN, 'must be a race id'),
  z.string().regex(T100_SLUG, 'must be an entry-platform event slug without the year, e.g. "london-t100"'),
);

/** Status file name → source. */
export const REGISTRATION_FILES: Record<string, RegistrationSourceId> = {
  'ironman.json': 'ironman',
  't100.json': 't100',
};

/** Race id → entry-platform event slug for the T100 refresh (scripts/refresh-t100.ts). */
export const T100_SOURCES_FILE = 't100-sources.json';

export interface RegistrationValidation {
  issues: Issue[];
  /** The files that passed the schema, by source. */
  data: RegistrationData;
  /** t100-sources.json when present and valid. */
  t100Sources: Record<string, string> | null;
  errorCount: number;
  warningCount: number;
}

export function validateRegistrationFiles(
  files: readonly SourceFile[],
  races: readonly Race[],
  today: ISODate,
): RegistrationValidation {
  const issues: Issue[] = [];
  const data: RegistrationData = {};
  let t100Sources: Record<string, string> | null = null;
  const byId = new Map(races.map((r) => [r.id, r]));
  const push = (level: IssueLevel, file: string, message: string, id?: string) =>
    issues.push({ level, file, message, ...(id ? { id } : {}) });

  for (const { name: file, text } of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      push('error', file, `is not valid JSON: ${(e as Error).message}`);
      continue;
    }

    if (file === T100_SOURCES_FILE) {
      const parsed = T100SourcesSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues)
          push('error', file, `${formatIssuePath(issue.path)}: ${issue.message}`);
        continue;
      }
      for (const id of Object.keys(parsed.data)) {
        const race = byId.get(id);
        if (!race) push('error', file, 'is not the id of any race', id);
        else if (race.brand !== 't100') push('error', file, `is a ${race.brand} race, not a T100 race`, id);
      }
      t100Sources = parsed.data;
      continue;
    }

    const source = REGISTRATION_FILES[file];
    if (!source) {
      push('warning', file, 'is not one of the registration files listed in data/README.md (ignored)');
      continue;
    }
    const parsed = RegistrationFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const where = formatIssuePath(issue.path);
        const id = issue.path[0] === 'races' && typeof issue.path[1] === 'string' ? issue.path[1] : undefined;
        push('error', file, `${where ? `${where}: ` : ''}${issue.message}`, id);
      }
      continue;
    }
    const reg = parsed.data;
    const checked = checkedDay(reg.checkedAt);
    if (checked > addDays(today, 1)) {
      push('error', file, `checkedAt ${reg.checkedAt} is in the future`);
    } else if (daysBetween(checked, today) > REGISTRATION_MAX_AGE_DAYS) {
      push(
        'warning',
        file,
        `checked ${daysBetween(checked, today)} days ago: the app does not show statuses older than ${REGISTRATION_MAX_AGE_DAYS} days (npm run refresh:${source})`,
      );
    }
    const brand = REGISTRATION_SOURCES[source].brand;
    for (const [id, entry] of Object.entries(reg.races)) {
      const race = byId.get(id);
      if (!race) {
        push('error', file, 'is not the id of any race', id);
        continue;
      }
      if (race.brand !== brand) {
        push('error', file, `is a ${race.brand} race: ${file} only holds ${brand} races`, id);
        continue;
      }
      if (REGISTRATION_METHOD_INFO[entry.method].source !== source) {
        push('error', file, `method "${entry.method}" is not a way ${file} is read`, id);
      }
      if (entry.checkedAt && entry.checkedAt > reg.checkedAt) {
        push('error', file, `checkedAt ${entry.checkedAt} is later than the file's checkedAt ${reg.checkedAt}`, id);
      }
      if (isOverdue(entry, today)) {
        push(
          'warning',
          file,
          `"opening-soon", but it opened on ${entry.opens}: not shown until a refresh (npm run refresh:${source})`,
          id,
        );
      }
      if (entry.opens && entry.status !== 'opening-soon') {
        push('warning', file, `"opens" only means something for status "opening-soon" (not "${entry.status}")`, id);
      }
      if (!entry.editionDate) {
        push('warning', file, 'has no editionDate, so the app cannot tell which edition it is about (not shown)', id);
      } else if (!race.nextEdition) {
        push('warning', file, `status for ${entry.editionDate}, but the race has no next edition (not shown)`, id);
      } else if (!editionMatches(entry.editionDate, race.nextEdition)) {
        push(
          'warning',
          file,
          `status for the edition of ${entry.editionDate}, but the next edition in data/races is ${race.nextEdition.date}${race.nextEdition.estimated ? ' (estimated)' : ''} (not shown)`,
          id,
        );
      }
    }
    data[source] = reg;
  }

  const errorCount = issues.filter((i) => i.level === 'error').length;
  return { issues, data, t100Sources, errorCount, warningCount: issues.length - errorCount };
}
