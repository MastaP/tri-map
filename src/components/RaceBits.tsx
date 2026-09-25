import { Trophy } from 'lucide-react';
import { DISTANCES, type DistanceId } from '../data/brands.ts';
import type { NextEdition } from '../data/nextEdition.ts';
import { cn } from '../lib/cn.ts';
import { dayOfMonth, monthAbbrev, weekdayShort } from '../lib/dates.ts';
import { shortChampionship } from '../lib/raceText.ts';

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
      {long ? DISTANCES[distance].long : DISTANCES[distance].label}
    </span>
  );
}

export function ChampionshipBadge({ title, short = true }: { title: string; short?: boolean }) {
  return (
    <span
      className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-200"
      title={title}
    >
      <Trophy className="size-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
      <span className="truncate">{short ? shortChampionship(title) : title}</span>
    </span>
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
