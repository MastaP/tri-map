/**
 * T100 World Championship Tour registration status, for the age-group 100 km race of each
 * race's next edition:
 *
 * 1. The PTO entry platform (njuko):
 *    https://front-api.registrations.protriathletes.org/edition/url/<slug> returns an
 *    edition (e.g. london-t100-2027) with its competitions (the age-group 100 km race, the
 *    Olympic and sprint races, relays…), their ids, dates and settings.
 * 2. The organiser's site: https://t100triathlon.com/wp-json/njuko/v1/competition-price
 *    ?competition_id=<id>&edition_id=<id> answers what its entry buttons show for that
 *    competition: live, upcoming, sold_out or wait_list. This is the status ("organiser").
 * 3. When the organiser's site cannot be read (it sits behind Cloudflare, which may turn
 *    away GitHub-hosted runners), only the platform's explicit signals count ("platform"):
 *    not published yet or a future opening date → opening soon; closed, archived, past
 *    the entry deadline or race day → closed; waiting-list mode → waitlist. The platform
 *    cannot tell open from sold out (its entry counts do not add up to the places, see
 *    NjukoCompetition.place), so otherwise the race keeps its previous status for the same
 *    edition, which ages out after 30 days, or gets none.
 *
 * Pure parsing and status rules here; scripts/refresh-t100.ts does the requests (daily in
 * CI, through scripts/registration/run.ts).
 *
 * Which edition: data/registration/t100-sources.json maps a race id to the platform's
 * event slug without the year ("london-t100"); the year is that of the race's next
 * edition in data/races, so the refresh follows the data from one year to the next.
 * T100 Challenger events enter on Active.com, not this platform, and have no status.
 */
import {
  editionMatches,
  REGISTRATION_STATUSES,
  type RegistrationEntry,
  type RegistrationFile,
  type RegistrationMethod,
  type RegistrationStatus,
} from '../../src/data/registration.ts';
import type { Race } from '../../src/data/types.ts';
import type { ISODate } from '../../src/lib/dates.ts';
import { countBy, fileErrors, MIN_MATCH_SHARE, sortedEntries, type Fetcher } from './common.ts';

export const T100_API = 'https://front-api.registrations.protriathletes.org/edition/url/';
/** The public entry page of an edition: in.registrations.protriathletes.org/<slug>. */
export const T100_ENTRY = 'https://in.registrations.protriathletes.org/';
export const t100ApiUrl = (slug: string) => `${T100_API}${encodeURIComponent(slug)}`;
/** The organiser's entry status endpoint (what t100triathlon.com's entry buttons show). */
export const T100_ORGANISER = 'https://t100triathlon.com/wp-json/njuko/v1/competition-price';
export const t100OrganiserUrl = (competitionId: string, editionId: string) =>
  `${T100_ORGANISER}?competition_id=${encodeURIComponent(competitionId)}&edition_id=${encodeURIComponent(editionId)}`;

interface NjukoName {
  language?: string;
  translation?: string;
}

/** The fields of a competition this script reads (the API returns many more). */
export interface NjukoCompetition {
  /** The competition id, which the organiser's endpoint takes as competition_id. */
  _id?: string;
  name?: NjukoName[];
  reportName?: string;
  competitionType?: string;
  placeLimit?: boolean;
  /**
   * The competition's place limit. Not used: it does not say whether places are left.
   * Evidence (API responses of 2026-09-25/26, saved in tests/fixtures/registration/t100/):
   * - it does not move as entries come in: gold-coast-t100-2027's Olympic race went from
   *   308 to 309 reserved entries between two reads while `place` stayed 1579;
   * - the reserved entries do not add up to it: london-t100-2026 100 km, which the
   *   organiser's site shows as "ENTRIES SOLD OUT", has place 1750 and 2397 reserved,
   *   while Dubai 2026 100 km (875 reserved of 895) is still on sale.
   * So the refresh never infers "sold out" from entry counts: the organiser's own status
   * says it, or the platform's waiting-list mode does.
   */
  place?: string | number | null;
  waitingListMode?: boolean;
  /** Race start (UTC). */
  startDate?: string | null;
  /** Entries open / close (UTC). */
  startDateRegistrations?: string | null;
  endDateRegistrations?: string | null;
  hideOnFront?: boolean;
  activeIndividual?: boolean;
  prices?: { reservedCount?: number | null }[];
}

export interface NjukoEdition {
  /** The edition id, which the organiser's endpoint takes as edition_id. */
  _id?: string;
  /** OPEN, DRAFT (not published yet) or CLOSED. */
  status?: string;
  /** When the whole edition opens for entries, if set (UTC). */
  openDate?: string | null;
  startDate?: string | null;
  /** Windows time zone name, e.g. "GMT Standard Time". */
  timezone?: string | null;
  isArchived?: boolean;
  competitions?: NjukoCompetition[];
}

export function competitionName(c: NjukoCompetition): string {
  const names = c.name ?? [];
  const en = names.find((n) => n.language === 'en') ?? names[0];
  return (en?.translation ?? c.reportName ?? '').replace(/\s+/g, ' ').trim();
}

/** Not the age-group 100 km triathlon, even with "100km" in the name. */
const NOT_AGE_GROUP_100K = /relay|team|aquabike|duathlon|aquathlon|junior|youth|kids|\bpro\b|elite/i;
/** Qualifier-only 100 km races next to the open one (Qatar 2026's "Age-Group World Championships"). */
const QUALIFIER = /championship|qualif/i;

/**
 * The age-group 100 km competition of an edition: an individual race with "100km" in its
 * name that is not a relay, team, junior or pro race, preferring the open one over a
 * championship next to it. An error when there is none or it is ambiguous.
 */
export function pickAgeGroup100k(edition: NjukoEdition): { competition: NjukoCompetition } | { error: string } {
  const candidates = (edition.competitions ?? []).filter((c) => {
    const name = competitionName(c);
    return (
      /\b100\s?km\b/i.test(name) &&
      (c.competitionType ?? 'INDIVIDUAL').toUpperCase() === 'INDIVIDUAL' &&
      !NOT_AGE_GROUP_100K.test(name)
    );
  });
  if (!candidates.length) return { error: 'no individual 100 km competition in this edition' };
  const open = candidates.filter((c) => !QUALIFIER.test(competitionName(c)));
  const pick = open.length === 1 ? open[0] : candidates.length === 1 ? candidates[0] : undefined;
  if (!pick) {
    return {
      error: `more than one 100 km competition: ${candidates.map((c) => `"${competitionName(c)}"`).join(', ')}`,
    };
  }
  return { competition: pick };
}

/** Windows time zone names the platform uses → IANA, for the local race day. */
const WINDOWS_TIME_ZONES: Record<string, string> = {
  UTC: 'UTC',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'GTB Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Helsinki',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arab Standard Time': 'Asia/Riyadh',
  'India Standard Time': 'Asia/Kolkata',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Korea Standard Time': 'Asia/Seoul',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'W. Australia Standard Time': 'Australia/Perth',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'South Africa Standard Time': 'Africa/Johannesburg',
};

/** The local calendar day of a UTC timestamp in the edition's time zone (the UTC day if unknown). */
export function localDay(iso: string, timeZone?: string | null): ISODate {
  const zone = timeZone ? (WINDOWS_TIME_ZONES[timeZone] ?? (timeZone.includes('/') ? timeZone : undefined)) : undefined;
  const t = new Date(iso);
  if (zone) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(t)
        .slice(0, 10);
    } catch {
      /* unknown zone: fall through */
    }
  }
  return t.toISOString().slice(0, 10);
}

const time = (s: string | null | undefined) => (s ? Date.parse(s) : Number.NaN);

/** What the entry platform says for sure about an edition's age-group 100 km race. */
export interface PlatformReading {
  competitionName: string;
  /** OPEN, DRAFT, CLOSED… as the platform says it. */
  editionStatus: string;
  editionId?: string;
  competitionId?: string;
  /** Race day in the edition's time zone (YYYY-MM-DD), else the year of the slug. */
  editionDate?: string;
  /**
   * The status the platform's explicit signals give, or undefined when they cannot tell
   * (entries open, or sold out without a waiting list, or an inconsistent entry window).
   */
  status?: RegistrationStatus;
  /** When entries open (local day), for opening-soon, when the date is in the future and consistent. */
  opens?: ISODate;
  /**
   * The platform setting that gave `status`, in words, for the entry's label ("Entries
   * open 2026-10-05", "Edition not published yet"…). Not the edition status alone: an
   * OPEN edition may still be opening soon or closed.
   */
  signal?: string;
}

/**
 * The platform's explicit signals for an edition's age-group 100 km race at `now`, in this
 * order:
 *
 * 1. edition DRAFT (not published) → opening-soon;
 * 2. edition CLOSED or archived → closed;
 * 3. an edition opening date in the future → opening-soon;
 * 4. race day passed → closed;
 * 5. the race's entry window (start/end of registrations) not started → opening-soon,
 *    over → closed (only when the window is consistent: it may end before it starts,
 *    which t100triathlon.com shows as "opening soon");
 * 6. waiting-list mode → waitlist;
 * 7. otherwise nothing: open and sold out look the same here.
 *
 * An error for an edition without a clear age-group 100 km race or with an unknown status.
 */
export function readPlatform(edition: NjukoEdition, slug: string, now: Date): PlatformReading | { error: string } {
  const picked = pickAgeGroup100k(edition);
  if ('error' in picked) return picked;
  const c = picked.competition;
  const tz = edition.timezone;
  const t = now.getTime();
  const regStart = time(c.startDateRegistrations);
  const regEnd = time(c.endDateRegistrations);
  const openDate = time(edition.openDate);
  const raceStart = [c.startDate, edition.startDate].find((d) => !Number.isNaN(time(d)));
  const inverted = regEnd < regStart;
  const editionStatus = (edition.status ?? '').toUpperCase();
  const day = (ms: number) => localDay(new Date(ms).toISOString(), tz);

  let status: RegistrationStatus | undefined;
  let opens: ISODate | undefined;
  let signal: string | undefined;
  if (editionStatus === 'DRAFT') {
    status = 'opening-soon';
    signal = 'Edition not published yet';
    if (!inverted && regStart > t) opens = day(regStart);
  } else if (editionStatus === 'CLOSED' || edition.isArchived) {
    status = 'closed';
    signal = editionStatus === 'CLOSED' ? 'Edition closed' : 'Edition archived';
  } else if (editionStatus !== 'OPEN') return { error: `unknown edition status "${edition.status ?? ''}"` };
  else if (openDate > t) {
    status = 'opening-soon';
    opens = day(openDate);
    signal = `Entries open ${opens}`;
  } else if (time(raceStart) <= t) {
    status = 'closed';
    signal = 'Race day has passed';
  } else if (!inverted && regStart > t) {
    status = 'opening-soon';
    opens = day(regStart);
    signal = `Entries open ${opens}`;
  } else if (!inverted && regEnd <= t) {
    status = 'closed';
    signal = 'Entries closed';
  } else if (c.waitingListMode) {
    status = 'waitlist';
    signal = 'Waiting list';
  }

  const year = /-(\d{4})$/.exec(slug)?.[1];
  const editionDate = raceStart ? localDay(raceStart, tz) : year;
  return {
    competitionName: competitionName(c),
    editionStatus,
    ...(edition._id ? { editionId: edition._id } : {}),
    ...(c._id ? { competitionId: c._id } : {}),
    ...(editionDate ? { editionDate } : {}),
    ...(status ? { status } : {}),
    ...(opens ? { opens } : {}),
    ...(signal ? { signal } : {}),
  };
}

/** t100triathlon.com's statuses (its entry buttons) → ours. */
export const ORGANISER_STATUSES: Readonly<Record<string, RegistrationStatus>> = {
  live: 'open',
  upcoming: 'opening-soon',
  sold_out: 'sold-out',
  wait_list: 'waitlist',
};

/**
 * The organiser endpoint's answer: `{"status":"sold_out","message":"ENTRIES SOLD OUT"}`,
 * `{"status":"live","button_text":"REGISTER NOW",…}`. An error for anything else (a
 * Cloudflare page instead of JSON, a status this script does not know).
 */
export function readOrganiser(text: string): { status: RegistrationStatus; wording: string } | { error: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'the answer is not JSON (a Cloudflare page?)' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'the answer is not an object' };
  const b = body as { status?: unknown; message?: unknown; button_text?: unknown };
  const raw = typeof b.status === 'string' ? b.status : '';
  const status = ORGANISER_STATUSES[raw];
  if (!status) return { error: `unknown status "${raw}"` };
  const words = [b.message, b.button_text].find((w): w is string => typeof w === 'string' && w.trim() !== '');
  return { status, wording: (words ?? raw).replace(/\s+/g, ' ').trim() };
}

const LABEL_MAX = 200;
const clip = (s: string) => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s);

/** The file entry for a status read one way or the other. */
export function t100Entry(
  reading: PlatformReading,
  slug: string,
  status: RegistrationStatus,
  wording: string,
  method: RegistrationMethod,
): RegistrationEntry {
  return {
    status,
    label: clip(`${wording} · ${reading.competitionName}`),
    method,
    ...(reading.editionDate ? { editionDate: reading.editionDate } : {}),
    url: `${T100_ENTRY}${slug}`,
    ...(status === 'opening-soon' && reading.opens ? { opens: reading.opens } : {}),
  };
}

export interface T100RaceResult {
  raceId: string;
  slug?: string;
  /**
   * organiser / platform: a status read that way; unknown: the edition was read but its
   * status could not be told; the others: no edition read.
   */
  outcome: 'organiser' | 'platform' | 'unknown' | 'no-edition' | 'no-next-edition' | 'unusable' | 'failed';
  detail?: string;
  /** Why t100triathlon.com's status was not used (when the outcome is not "organiser"). */
  organiserError?: string;
  entry?: RegistrationEntry;
  /** No status could be read now, and the previous one for the same edition was kept. */
  carriedOver?: boolean;
}

export interface T100Refresh {
  ok: boolean;
  error?: string;
  results: T100RaceResult[];
  /** T100 races with no entry in t100-sources.json. */
  unmapped: Race[];
  file?: RegistrationFile;
}

/**
 * Read each mapped race's next edition from the entry platform and its status from the
 * organiser (or the platform's explicit signals), and build the new file. A race whose
 * status cannot be read now (a failed request, or a platform that cannot tell) keeps its
 * previous entry when that is about the same edition, with its old `checkedAt`, so the app
 * still ages it out after 30 days. Refuses (ok: false) when fewer than MIN_MATCH_SHARE of
 * the platform requests were answered, when no edition was read at all, or when the file
 * would not validate, so a broken run never replaces good data.
 */
export async function refreshT100({
  fetcher,
  races,
  sources,
  previous,
  now,
  today,
}: {
  fetcher: Fetcher;
  races: readonly Race[];
  sources: Record<string, string>;
  previous: RegistrationFile | undefined;
  now: Date;
  today: ISODate;
}): Promise<T100Refresh> {
  const byId = new Map(races.map((r) => [r.id, r]));
  const results: T100RaceResult[] = [];
  for (const [raceId, prefix] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    const race = byId.get(raceId);
    const next = race?.nextEdition;
    if (!next) {
      results.push({
        raceId,
        outcome: 'no-next-edition',
        detail: race ? 'no next edition in data/races' : 'unknown race',
      });
      continue;
    }
    const slug = `${prefix}-${next.date.slice(0, 4)}`;
    /** No status now: keep the previous entry if it is about this edition. */
    const keep = (outcome: 'failed' | 'unknown', detail: string, organiserError?: string): T100RaceResult => {
      const old = previous?.races[raceId];
      const base = { raceId, slug, outcome, detail, ...(organiserError ? { organiserError } : {}) };
      return old?.editionDate && editionMatches(old.editionDate, next)
        ? { ...base, carriedOver: true, entry: { ...old, checkedAt: old.checkedAt ?? previous!.checkedAt } }
        : base;
    };
    let res;
    try {
      res = await fetcher(t100ApiUrl(slug));
    } catch (e) {
      results.push(keep('failed', `request failed (${(e as Error).message})`));
      continue;
    }
    if (res.status === 404) {
      results.push({ raceId, slug, outcome: 'no-edition', detail: `no edition "${slug}" on the entry platform yet` });
      continue;
    }
    if (res.status !== 200) {
      results.push(keep('failed', `HTTP ${res.status}`));
      continue;
    }
    let edition: unknown;
    try {
      edition = JSON.parse(res.text);
    } catch {
      results.push(keep('failed', 'the response is not JSON'));
      continue;
    }
    let reading: ReturnType<typeof readPlatform>;
    try {
      if (!edition || typeof edition !== 'object') throw new Error('the response is not an edition');
      reading = readPlatform(edition as NjukoEdition, slug, now);
    } catch (e) {
      // An answer in a shape this script does not know: no status rather than a guess.
      reading = { error: `unexpected response (${(e as Error).message})` };
    }
    if ('error' in reading) {
      results.push({ raceId, slug, outcome: 'unusable', detail: reading.error });
      continue;
    }

    let organiserError: string;
    if (reading.competitionId && reading.editionId) {
      try {
        const o = await fetcher(t100OrganiserUrl(reading.competitionId, reading.editionId));
        const read = o.status === 200 ? readOrganiser(o.text) : { error: `HTTP ${o.status}` };
        if ('status' in read) {
          results.push({
            raceId,
            slug,
            outcome: 'organiser',
            entry: t100Entry(reading, slug, read.status, read.wording, 'organiser'),
          });
          continue;
        }
        organiserError = read.error;
      } catch (e) {
        organiserError = `request failed (${(e as Error).message})`;
      }
    } else {
      organiserError = 'the entry platform gave no competition or edition id to ask with';
    }

    if (reading.status) {
      results.push({
        raceId,
        slug,
        outcome: 'platform',
        organiserError,
        entry: t100Entry(reading, slug, reading.status, reading.signal ?? (reading.editionStatus || '?'), 'platform'),
      });
    } else {
      results.push(keep('unknown', 'the entry platform cannot tell open from sold out', organiserError));
    }
  }
  const unmapped = races.filter((r) => r.brand === 't100' && r.nextEdition && !(r.id in sources));

  const attempted = results.filter((r) => r.outcome !== 'no-next-edition').length;
  const answered = results.filter((r) => !['failed', 'no-next-edition'].includes(r.outcome));
  const read = results.filter((r) => ['organiser', 'platform', 'unknown'].includes(r.outcome)).length;
  if (attempted && (answered.length < attempted * MIN_MATCH_SHARE || read === 0)) {
    return {
      ok: false,
      error: `only ${answered.length} of ${attempted} requests were answered and ${read} editions read: is the entry platform down or changed?`,
      results,
      unmapped,
    };
  }
  const entries = Object.fromEntries(results.flatMap((r) => (r.entry ? [[r.raceId, r.entry] as const] : [])));
  const file: RegistrationFile = { source: T100_API, checkedAt: now.toISOString(), races: sortedEntries(entries) };
  const errors = fileErrors('t100.json', file, races, today);
  if (errors.length) {
    return {
      ok: false,
      error: `the new file would not validate: ${errors.map((e) => `${e.id ?? ''} ${e.message}`.trim()).join('; ')}`,
      results,
      unmapped,
    };
  }
  return { ok: true, results, unmapped, file };
}

/** The refresh summary printed by `npm run refresh:t100`. */
export function t100Summary(r: T100Refresh): string {
  const lines: string[] = [];
  const fresh = r.results.flatMap((x) => (x.entry && !x.carriedOver ? [x.entry] : []));
  lines.push(
    `${fresh.length} of ${r.results.length} mapped races read: ${
      countBy(
        fresh.map((e) => e.status),
        REGISTRATION_STATUSES,
      ) || 'none'
    }.`,
  );
  const asked = r.results.filter((x) => x.outcome === 'organiser' || x.organiserError);
  const organiser = r.results.filter((x) => x.outcome === 'organiser').length;
  if (asked.length) {
    lines.push(
      `t100triathlon.com gave the status of ${organiser} of ${asked.length} races${
        organiser < asked.length
          ? "; the others use the entry platform's explicit signals, or keep their previous status"
          : ''
      }.`,
    );
  }
  for (const x of r.results) {
    const what = x.entry
      ? `${x.entry.status}${x.entry.opens ? ` (opens ${x.entry.opens})` : ''} · ${x.entry.method} · ${x.entry.label} · edition ${x.entry.editionDate ?? '?'}`
      : '';
    const notes = [
      x.outcome === 'organiser' || x.outcome === 'platform' ? '' : `${x.outcome}: ${x.detail ?? ''}`,
      x.carriedOver ? `kept the previous status (checked ${x.entry?.checkedAt ?? '?'})` : '',
      x.organiserError ? `t100triathlon.com: ${x.organiserError}` : '',
    ].filter(Boolean);
    lines.push(`  ${x.raceId.padEnd(28)} ${(x.slug ?? '').padEnd(26)} ${[what, ...notes].filter(Boolean).join(' · ')}`);
  }
  if (r.unmapped.length) {
    lines.push(
      `${r.unmapped.length} listed T100 races have no entry-platform slug in t100-sources.json (no status; T100 Challenger events enter on Active.com):`,
    );
    lines.push(`  ${r.unmapped.map((x) => x.id).join(', ')}`);
  }
  return lines.join('\n');
}
