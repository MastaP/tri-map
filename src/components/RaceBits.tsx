import { Bike, Footprints, Lock, Ticket, Trophy, Waves } from 'lucide-react';
import { DISTANCES, type DistanceId } from '../data/brands.ts';
import type { EntryType, Terrain } from '../data/constants.ts';
import type { NextEdition } from '../data/nextEdition.ts';
import type { Race } from '../data/types.ts';
import { cn } from '../lib/cn.ts';
import { dayOfMonth, monthAbbrev, weekdayShort } from '../lib/dates.ts';
import {
  ENTRY_BADGE,
  ENTRY_EXPLAINER,
  isQualifierChampionship,
  shortChampionship,
  SWIM_LABEL,
  TERRAIN_LABEL,
} from '../lib/raceText.ts';

const DISTANCE_BADGE: Record<DistanceId, string> = {
  full: 'bg-ink text-on-ink',
  half: 'bg-surface-3 text-fg',
  t100: 'text-fg ring-1 ring-inset ring-line-strong',
};

export function DistanceBadge({
  distance,
  long,
  className,
}: {
  distance: DistanceId;
  long?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-1.5 font-display text-[12px] leading-none font-bold tracking-[0.06em] uppercase',
        DISTANCE_BADGE[distance],
        className,
      )}
      title={`${DISTANCES[distance].long}: ${DISTANCES[distance].swim} km swim, ${DISTANCES[distance].bike} km bike, ${DISTANCES[distance].run} km run`}
    >
      {distance === 't100' ? (
        // "T100 · 100 km": the name plus how far it is, with the unit in lower case.
        <>
          T100 <span className="ml-0.5 font-bold tracking-[0.02em] normal-case">· {DISTANCES.t100.total} km</span>
        </>
      ) : long ? (
        DISTANCES[distance].badgeLong
      ) : (
        DISTANCES[distance].badge
      )}
    </span>
  );
}

/**
 * A championship an age-grouper has to qualify for is prominent ("qualify first"). Every
 * other title (regional championships, a pro tour final at a race with open entry) is a
 * quiet secondary tag: it mostly matters to pros.
 */
export function ChampionshipBadge({
  race,
  short = true,
}: {
  race: Pick<Race, 'championship' | 'entry'>;
  short?: boolean;
}) {
  const title = race.championship;
  if (!title) return null;
  const world = isQualifierChampionship(race);
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-[11px]',
        world
          ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-200'
          : 'font-medium text-muted ring-1 ring-line ring-inset',
      )}
      title={world ? `${title}: qualifier only` : title}
    >
      <Trophy
        className={cn('size-3 shrink-0', !world && 'opacity-70')}
        strokeWidth={world ? 2.4 : 2}
        aria-hidden="true"
      />
      <span className="truncate">{short ? shortChampionship(title) : title}</span>
    </span>
  );
}

/** "Qualifier only" / "Ballot": you cannot simply sign up. Open entry has no badge. */
export function EntryBadge({ entry, className }: { entry: EntryType; className?: string }) {
  if (entry === 'open') return null;
  const Icon = entry === 'qualification' ? Lock : Ticket;
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-rose-100 px-1.5 text-[11px] font-semibold whitespace-nowrap text-rose-900 dark:bg-rose-400/15 dark:text-rose-200',
        className,
      )}
      title={ENTRY_EXPLAINER[entry]}
    >
      <Icon className="size-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
      {ENTRY_BADGE[entry]}
    </span>
  );
}

/** Elevation silhouettes in a 20 × 11 box: a flat line, a gentle wave, two hills, peaks. */
const TERRAIN_PATHS: Record<Terrain, string> = {
  flat: 'M1.5 7.5H18.5',
  rolling: 'M1.5 8C4 5.4 6 5.4 8.5 7.2S13 8.6 15 6.4C16.5 4.9 17.6 5 18.5 5.8',
  hilly: 'M1.5 9L6 4.6L9 7L13.5 2.6L18.5 8.6',
  mountainous: 'M1.5 9.6L5 3.6L7.5 6.4L11 1L14.5 6L16.2 4.2L18.5 9.6',
};

/**
 * Course-profile glyph: a small elevation silhouette. Decorative; the profile is always
 * named in text next to it or in an accessible label.
 */
export function TerrainGlyph({ terrain, className }: { terrain: Terrain; className?: string }) {
  const line = TERRAIN_PATHS[terrain];
  return (
    <svg
      viewBox="0 0 20 11"
      className={cn('h-[11px] w-5 shrink-0 overflow-visible', className)}
      aria-hidden="true"
      focusable="false"
      data-terrain={terrain}
    >
      {terrain !== 'flat' && <path d={`${line}L18.5 10.5H1.5Z`} fill="currentColor" opacity={0.18} />}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      {terrain === 'flat' && <path d="M1.5 10.2H18.5" stroke="currentColor" strokeWidth={1} opacity={0.3} />}
    </svg>
  );
}

/** Compact bike-course hint for result cards: bike icon, elevation silhouette and the word. */
export function BikeHint({ terrain }: { terrain: Terrain }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap text-muted ring-1 ring-line ring-inset"
      title={`${TERRAIN_LABEL[terrain]} bike course`}
    >
      <Bike className="size-3.5" strokeWidth={2} aria-hidden="true" />
      <TerrainGlyph terrain={terrain} />
      <span className="sr-only">Bike course: </span>
      {TERRAIN_LABEL[terrain]}
    </span>
  );
}

/** "Sea swim · Rolling bike · Flat run": the course at a glance, for comparing a shortlist. */
export function CourseLine({ race }: { race: Pick<Race, 'swim' | 'bike' | 'run'> }) {
  const item = (Icon: typeof Bike, text: string | null, what: string, terrain?: Terrain) => (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', !text && 'text-faint')}>
      <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {terrain && <TerrainGlyph terrain={terrain} />}
      <span className="sr-only">{what}: </span>
      {text ?? 'not listed'}
    </span>
  );
  return (
    <p
      className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-medium text-muted"
      data-testid="course-line"
    >
      {item(Waves, race.swim ? SWIM_LABEL[race.swim] : null, 'Swim')}
      {item(Bike, race.bike ? TERRAIN_LABEL[race.bike] : null, 'Bike course', race.bike)}
      {item(Footprints, race.run ? TERRAIN_LABEL[race.run] : null, 'Run course', race.run)}
    </p>
  );
}

export function StatusBadge({ next }: { next: NextEdition | null }) {
  if (!next) return null;
  if (next.estimated)
    return (
      <span className="inline-flex h-5 items-center rounded-md border border-dashed border-line-strong px-1.5 text-[11px] font-semibold text-muted">
        Estimated
      </span>
    );
  if (next.status === 'tentative')
    return (
      <span
        className="inline-flex h-5 items-center rounded-md bg-surface-3 px-1.5 text-[11px] font-semibold text-muted"
        title="Provisional date: not yet confirmed by the organiser"
      >
        TBC
      </span>
    );
  return null;
}

/** Calendar tile: month, day and weekday; estimated dates are dashed with "≈". */
export function DateTile({ next, className }: { next: NextEdition | null; className?: string }) {
  const base = 'flex w-12 shrink-0 flex-col items-center rounded-xl py-1 text-center leading-none';
  if (!next)
    return (
      <div className={cn(base, 'border border-dashed border-line-strong text-faint', className)} aria-hidden="true">
        <span className="text-[10px] font-semibold uppercase">Date</span>
        <span className="font-display text-[22px] font-bold">?</span>
        <span className="text-[10px] font-semibold uppercase">TBA</span>
      </div>
    );
  const month = `${monthAbbrev(next.date.slice(0, 7))} ’${next.date.slice(2, 4)}`;
  if (next.estimated)
    return (
      <div className={cn(base, 'border border-dashed border-line-strong text-muted', className)} aria-hidden="true">
        <span className="mt-0.5 text-[10px] font-semibold uppercase">{month}</span>
        <span className="font-display text-[22px] leading-6 font-bold">≈</span>
        <span className="text-[10px] font-semibold uppercase">TBA</span>
      </div>
    );
  return (
    <div className={cn(base, 'border border-line bg-surface-2', className)} aria-hidden="true">
      <span className="mt-0.5 text-[10px] font-semibold text-muted uppercase">{month}</span>
      <span className="tabular font-display text-[22px] leading-6 font-bold text-fg">{dayOfMonth(next.date)}</span>
      <span className="text-[10px] font-semibold text-muted uppercase">{weekdayShort(next.date)}</span>
    </div>
  );
}
