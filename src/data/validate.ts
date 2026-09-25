/**
 * Full data validation used by `npm run validate:data` and the build-time guard in
 * vite.config.ts. Pure: takes file names + raw text, returns issues. Errors fail CI;
 * warnings are advisory.
 */
import type { ISODate } from '../lib/dates.ts';
import { daysBetween } from '../lib/dates.ts';
import { haversineKm } from '../lib/geo.ts';
import { BRAND_IDS, DISTANCE_IDS, type BrandId, type DistanceId } from './brands.ts';
import { isNearStandard, legsText, NEAR_STANDARD_TOLERANCE } from './course.ts';
import { deriveRace } from './derive.ts';
import { getCountry, isInRegionBox, REGION_IDS, REGIONS, type RegionId } from './regions.ts';
import { formatIssuePath, RaceSchema, type RaceRecord } from './schema.ts';
import type { Race } from './types.ts';

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  file: string;
  id?: string;
  message: string;
}

export interface SourceFile {
  name: string;
  text: string;
}

export interface ValidatedRace extends Race {
  file: string;
}

export interface ValidationResult {
  issues: Issue[];
  races: ValidatedRace[];
  errorCount: number;
  warningCount: number;
}

interface FileScope {
  brand?: BrandId;
  distance?: DistanceId;
  regions?: RegionId[];
}

/** Expected contents per file, from data/README.md. Mismatches are warnings. */
export const FILE_SCOPES: Record<string, FileScope> = {
  'ironman-full.json': { brand: 'ironman', distance: 'full' },
  'ironman-703-europe.json': { brand: 'ironman', distance: 'half', regions: ['europe'] },
  'ironman-703-americas.json': { brand: 'ironman', distance: 'half', regions: ['north-america', 'latin-america'] },
  'ironman-703-apac-mea.json': {
    brand: 'ironman',
    distance: 'half',
    regions: ['asia', 'oceania', 'middle-east', 'africa'],
  },
  'challenge.json': { brand: 'challenge' },
  't100.json': { brand: 't100', distance: 't100' },
  'independent.json': { brand: 'independent' },
};

const EXPECTED_SERIES: Partial<Record<`${BrandId}:${DistanceId}`, string[]>> = {
  'ironman:full': ['IRONMAN'],
  'ironman:half': ['IRONMAN 70.3'],
  't100:t100': ['T100 World Championship Tour', 'T100 Challenger'],
};

function decimals(n: number): number {
  const s = String(n);
  if (s.includes('e')) return 10;
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function validateRaceFiles(files: readonly SourceFile[], today: ISODate): ValidationResult {
  const issues: Issue[] = [];
  const races: ValidatedRace[] = [];
  const idToFile = new Map<string, string>();
  const push = (level: IssueLevel, file: string, message: string, id?: string) =>
    issues.push({ level, file, message, ...(id ? { id } : {}) });

  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const { name: file, text } of sortedFiles) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      push('error', file, `is not valid JSON: ${(e as Error).message}`);
      continue;
    }
    if (!Array.isArray(data)) {
      push('error', file, 'must be a bare JSON array of race objects');
      continue;
    }
    if (data.length === 0) push('warning', file, 'is an empty array');
    const scope = FILE_SCOPES[file];
    if (!scope) push('warning', file, 'is not one of the files listed in data/README.md');

    data.forEach((raw: unknown, index) => {
      const rawId =
        raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
          ? (raw as { id: string }).id
          : `#${index}`;
      const parsed = RaceSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const where = formatIssuePath(issue.path);
          push('error', file, `${where ? `${where}: ` : ''}${issue.message}`, rawId);
        }
        return;
      }
      const rec: RaceRecord = parsed.data;
      const id = rec.id;

      const other = idToFile.get(id);
      if (other) {
        push('error', file, `duplicate id (also defined in ${other})`, id);
        return;
      }
      idToFile.set(id, file);

      const country = getCountry(rec.country)!;
      if (!isInRegionBox(country.region, rec.lat, rec.lng)) {
        push(
          'error',
          file,
          `lat/lng (${rec.lat}, ${rec.lng}) is outside the ${REGIONS[country.region].label} bounding box for ${country.name} — check the country code and the signs of lat/lng`,
          id,
        );
      }
      if (decimals(rec.lat) < 3 || decimals(rec.lng) < 3) {
        push('warning', file, `coordinates (${rec.lat}, ${rec.lng}) have fewer than 3 decimals`, id);
      }

      if (scope) {
        if (scope.brand && rec.brand !== scope.brand) {
          push('warning', file, `brand "${rec.brand}" does not belong in ${file} (expected "${scope.brand}")`, id);
        }
        if (scope.distance && rec.distance !== scope.distance) {
          push('warning', file, `distance "${rec.distance}" does not belong in ${file}`, id);
        }
        if (scope.regions && !scope.regions.includes(country.region)) {
          push('warning', file, `${country.name} (${REGIONS[country.region].label}) does not belong in ${file}`, id);
        }
      }

      const expectedSeries = EXPECTED_SERIES[`${rec.brand}:${rec.distance}`];
      if (expectedSeries && (!rec.series || !expectedSeries.includes(rec.series))) {
        push('warning', file, `series should be ${expectedSeries.map((s) => `"${s}"`).join(' or ')}`, id);
      }
      if (rec.brand === 't100' && rec.distance !== 't100') {
        push('warning', file, 'T100 races should use distance "t100"', id);
      }
      if (/\b20\d\d\b/.test(rec.name)) push('warning', file, 'name should not contain a year', id);
      if (rec.course && !isNearStandard(rec)) {
        push(
          'warning',
          file,
          `course (${legsText(rec.course)}) is within ${NEAR_STANDARD_TOLERANCE * 100}% of the standard on every leg: leave "course" out`,
          id,
        );
      }

      if (rec.verifiedAt > today) push('warning', file, `verifiedAt ${rec.verifiedAt} is in the future`, id);
      else if (daysBetween(rec.verifiedAt, today) > 365) {
        push('warning', file, `verifiedAt ${rec.verifiedAt} is more than a year old`, id);
      }
      const early = rec.editions.filter((e) => e.date < '2026-01-01');
      if (early.length) push('warning', file, `has ${early.length} edition(s) before 2026-01-01`, id);

      const race = deriveRace(rec, today);
      const recurs = rec.recurring !== false && rec.continuedAs === undefined;
      if (!race.nextEdition) {
        if (recurs) push('warning', file, 'every edition is cancelled: the race has no next date', id);
      } else if (race.nextEdition.estimated) {
        push('warning', file, `no edition on/after ${today}; next date is estimated as ${race.nextEdition.date}`, id);
      }
      if (race.nextEdition) {
        const missing = (['bike', 'run'] as const).filter((d) => rec[d] === undefined);
        if (missing.length) {
          push(
            'warning',
            file,
            `no ${missing.join(' or ')} course profile: a course filter hides this race (see "bike / run" in data/README.md)`,
            id,
          );
        }
      }
      races.push({ ...race, file });
    });
  }

  for (const r of races) {
    if (r.continuedAs === undefined) continue;
    const target = races.find((t) => t.id === r.continuedAs);
    if (!target) {
      push('error', r.file, `continuedAs "${r.continuedAs}" does not match any race id`, r.id);
    } else if (target.continuedAs === r.id) {
      push('error', r.file, `continuedAs "${r.continuedAs}", which continues as this race again (cycle)`, r.id);
    }
  }

  // Likely duplicates written into different files, or twice under different ids.
  for (let i = 0; i < races.length; i++) {
    for (let j = i + 1; j < races.length; j++) {
      const a = races[i]!;
      const b = races[j]!;
      const linked = a.continuedAs === b.id || b.continuedAs === a.id;
      if (!linked && a.distance === b.distance && haversineKm(a.lat, a.lng, b.lat, b.lng) < 2) {
        push('warning', b.file, `possible duplicate of ${a.id} (${a.file}): same distance within 2 km`, b.id);
      }
    }
  }

  const errorCount = issues.filter((i) => i.level === 'error').length;
  return { issues, races, errorCount, warningCount: issues.length - errorCount };
}

export interface DataSummary {
  total: number;
  byBrandDistance: Record<BrandId, Record<DistanceId, number>>;
  byRegionDistance: Record<RegionId, Record<DistanceId, number>>;
  byBrandRegion: Record<BrandId, Record<RegionId, number>>;
  estimated: number;
  tentative: number;
  noDate: number;
  /** Races without an upcoming *confirmed* date (estimated, tentative or none). */
  noUpcomingConfirmed: number;
  /** Listed races without a bike or run course profile (a course filter hides them). */
  missingCourse: number;
  latestVerifiedAt: string | null;
}

const zeroes = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function summarize(races: readonly Race[]): DataSummary {
  const byBrandDistance = Object.fromEntries(
    BRAND_IDS.map((b) => [b, zeroes(DISTANCE_IDS)]),
  ) as DataSummary['byBrandDistance'];
  const byRegionDistance = Object.fromEntries(
    REGION_IDS.map((r) => [r, zeroes(DISTANCE_IDS)]),
  ) as DataSummary['byRegionDistance'];
  const byBrandRegion = Object.fromEntries(
    BRAND_IDS.map((b) => [b, zeroes(REGION_IDS)]),
  ) as DataSummary['byBrandRegion'];
  let estimated = 0;
  let tentative = 0;
  let noDate = 0;
  let latest: string | null = null;
  let missingCourse = 0;
  for (const r of races) {
    if (r.nextEdition && (!r.bike || !r.run)) missingCourse++;
    byBrandDistance[r.brand][r.distance]++;
    byRegionDistance[r.region][r.distance]++;
    byBrandRegion[r.brand][r.region]++;
    if (!r.nextEdition) noDate++;
    else if (r.nextEdition.estimated) estimated++;
    else if (r.nextEdition.status === 'tentative') tentative++;
    if (!latest || r.verifiedAt > latest) latest = r.verifiedAt;
  }
  return {
    total: races.length,
    byBrandDistance,
    byRegionDistance,
    byBrandRegion,
    estimated,
    tentative,
    noDate,
    noUpcomingConfirmed: estimated + tentative + noDate,
    missingCourse,
    latestVerifiedAt: latest,
  };
}
