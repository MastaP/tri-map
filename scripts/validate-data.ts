/**
 * npm run validate:data [-- --dir <path>] [-- --fixtures] [-- --quiet]
 *
 * Validates every data/races/*.json file against the data contract (data/README.md):
 * zod schema, unique ids across files, id format, sorted editions, known country codes,
 * coordinates inside the country's region, https URLs. Then the registration status files
 * (data/registration, or with --dir <races dir> the sibling ../registration): known race
 * ids of the right brand, status values, dates. Prints a summary table.
 * Exits non-zero on any error; warnings never fail.
 */
import { relative, resolve } from 'node:path';
import { BRAND_IDS, BRANDS, DISTANCE_IDS, DISTANCES } from '../src/data/brands.ts';
import { REGION_IDS, REGIONS } from '../src/data/regions.ts';
import { REGISTRATION_STATUSES } from '../src/data/registration.ts';
import { summarize, validateRaceFiles, type Issue } from '../src/data/validate.ts';
import { validateRegistrationFiles } from '../src/data/validateRegistration.ts';
import { localToday } from '../src/lib/dates.ts';
import { dataDirFor, readRaceFiles, readRegistrationFiles, registrationDirFor } from './raceFiles.ts';

const args = process.argv.slice(2);
const dirArg = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : undefined;
const quiet = args.includes('--quiet');
const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : undefined;
const source = args.includes('--fixtures') ? 'fixtures' : process.env.VITE_RACE_DATA;
const dir = dirArg ? resolve(dirArg) : dataDirFor(source);
const today = todayArg ?? localToday();

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = c(31);
const yellow = c(33);
const green = c(32);
const dim = c(2);
const bold = c(1);

const files = readRaceFiles(dir);
const rel = relative(process.cwd(), dir) || '.';
console.log(bold(`Validating race data in ${rel}/ (today = ${today})`));

if (!files.length) {
  console.error(red(`✖ No *.json files found in ${rel}/`));
  process.exit(1);
}

const result = validateRaceFiles(files, today);
const regDir = dirArg ? resolve(dir, '..', 'registration') : registrationDirFor(source);
const regFiles = readRegistrationFiles(regDir);
const registration = validateRegistrationFiles(regFiles, result.races, today);
const regRel = relative(process.cwd(), regDir) || '.';
const allIssues = [...result.issues, ...registration.issues.map((i) => ({ ...i, file: `${regRel}/${i.file}` }))];
const errorCount = result.errorCount + registration.errorCount;
const warningCount = result.warningCount + registration.warningCount;

function printIssues(level: Issue['level']) {
  const list = allIssues.filter((i) => i.level === level);
  if (!list.length) return;
  const paint = level === 'error' ? red : yellow;
  console.log('\n' + paint(bold(`${level === 'error' ? 'Errors' : 'Warnings'} (${list.length})`)));
  let lastFile = '';
  for (const i of list) {
    if (i.file !== lastFile) {
      console.log(`  ${bold(i.file)}`);
      lastFile = i.file;
    }
    console.log(`    ${paint(level === 'error' ? '✖' : '!')} ${i.id ? `${i.id}: ` : ''}${i.message}`);
  }
}

printIssues('error');
if (!quiet) printIssues('warning');
else if (warningCount) console.log(dim(`\n${warningCount} warnings hidden (--quiet)`));

function table(
  title: string,
  rowKeys: readonly string[],
  rowLabel: (k: string) => string,
  colKeys: readonly string[],
  colLabel: (k: string) => string,
  cell: (r: string, col: string) => number,
) {
  const header = ['', ...colKeys.map(colLabel), 'Total'];
  const rows = rowKeys.map((r) => {
    const cells = colKeys.map((col) => cell(r, col));
    return [rowLabel(r), ...cells.map(String), String(cells.reduce((a, b) => a + b, 0))];
  });
  const totals = colKeys.map((col) => rowKeys.reduce((a, r) => a + cell(r, col), 0));
  rows.push(['Total', ...totals.map(String), String(totals.reduce((a, b) => a + b, 0))]);
  const widths = header.map((_, i) => Math.max(header[i]!.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((s, i) => (i === 0 ? s.padEnd(widths[i]!) : s.padStart(widths[i]!))).join('  ');
  console.log('\n' + bold(title));
  console.log('  ' + dim(line(header)));
  rows.forEach((row, i) => console.log('  ' + (i === rows.length - 1 ? bold(line(row)) : line(row))));
}

const s = summarize(result.races);
table(
  'Races by brand × distance',
  BRAND_IDS,
  (b) => BRANDS[b as keyof typeof BRANDS].label,
  DISTANCE_IDS,
  (d) => DISTANCES[d as keyof typeof DISTANCES].label,
  (b, d) => s.byBrandDistance[b as keyof typeof s.byBrandDistance][d as keyof typeof DISTANCES],
);
table(
  'Races by region × distance',
  REGION_IDS,
  (r) => REGIONS[r as keyof typeof REGIONS].label,
  DISTANCE_IDS,
  (d) => DISTANCES[d as keyof typeof DISTANCES].label,
  (r, d) => s.byRegionDistance[r as keyof typeof s.byRegionDistance][d as keyof typeof DISTANCES],
);
table(
  'Races by brand × region',
  BRAND_IDS,
  (b) => BRANDS[b as keyof typeof BRANDS].label,
  REGION_IDS,
  (r) => REGIONS[r as keyof typeof REGIONS].short,
  (b, r) => s.byBrandRegion[b as keyof typeof s.byBrandRegion][r as keyof typeof REGIONS],
);

console.log(
  `\n${bold(String(s.total))} valid races in ${files.length} files. ` +
    `${s.noUpcomingConfirmed} without an upcoming confirmed date ` +
    dim(
      `(${s.estimated} estimated, ${s.tentative} tentative, ${s.noDate} with no future edition, which the site does not list)`,
    ) +
    (s.latestVerifiedAt ? dim(`; latest verifiedAt ${s.latestVerifiedAt}`) : ''),
);
if (s.missingCourse) {
  console.log(
    yellow(`${s.missingCourse} listed races have no bike or run course profile`) +
      dim(' (a course filter hides them; add "bike" / "run" as data/README.md describes)'),
  );
}

const regSources = Object.entries(registration.data);
if (regSources.length || registration.t100Sources) {
  console.log('\n' + bold(`Registration status (${regRel}/)`));
  for (const [id, file] of regSources) {
    const counts = REGISTRATION_STATUSES.map(
      (st) => [st, Object.values(file.races).filter((e) => e.status === st).length] as const,
    )
      .filter(([, n]) => n > 0)
      .map(([st, n]) => `${n} ${st}`)
      .join(', ');
    console.log(
      `  ${id.padEnd(8)} checked ${file.checkedAt}: ${Object.keys(file.races).length} races (${counts || 'none'})`,
    );
  }
  if (registration.t100Sources) {
    console.log(
      dim(`  t100-sources.json maps ${Object.keys(registration.t100Sources).length} races to the entry platform`),
    );
  }
} else {
  console.log(dim(`\nNo registration status files in ${regRel}/`));
}

if (errorCount) {
  console.log(red(bold(`\n✖ ${errorCount} error(s), ${warningCount} warning(s)`)));
  process.exit(1);
}
console.log(green(bold(`\n✔ Data is valid`)) + dim(` (${warningCount} warning(s))`));
