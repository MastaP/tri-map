import { Star } from 'lucide-react';
import { memo } from 'react';
import { BRANDS, DISTANCES } from '../data/brands.ts';
import { isNearStandard, legsText, raceLegs } from '../data/course.ts';
import type { NextEdition } from '../data/nextEdition.ts';
import type { Race } from '../data/types.ts';
import { cn } from '../lib/cn.ts';
import { formatDate, formatMonthShort, type ISODate } from '../lib/dates.ts';
import { formatDistanceAway } from '../lib/nearest.ts';
import { courseSummary, ENTRY_BADGE, isQualifierChampionship, seriesLabel, whenText } from '../lib/raceText.ts';
import { BrandGlyph } from './BrandGlyph.tsx';
import { Flag } from './Flag.tsx';
import {
  BikeHint,
  ChampionshipBadge,
  CourseLine,
  DateTile,
  DistanceBadge,
  EntryBadge,
  NonStandardBadge,
  StatusBadge,
} from './RaceBits.tsx';

interface Props {
  race: Race;
  /**
   * The edition shown: the one inside the date filter, which can be a later one than
   * the next edition (a 2027 search shows the 2027 date of a race also held in 2026).
   */
  edition: NextEdition | null;
  today: ISODate;
  selected: boolean;
  hovered: boolean;
  starred: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onToggleStar: (id: string) => void;
  /** Distance from the "Nearest" origin in km; shown only while that sort is active. */
  distanceKm?: number | undefined;
  /** Show swim / bike / run profiles in words (shortlist comparison). */
  showCourse?: boolean;
}

export const RaceCard = memo(function RaceCard({
  race,
  edition,
  today,
  selected,
  hovered,
  starred,
  onSelect,
  onHover,
  onToggleStar,
  distanceKm,
  showCourse = false,
}: Props) {
  const next = edition;
  const later = !!next && !!race.nextEdition && next.date !== race.nextEdition.date ? race.nextEdition : null;
  const dateLabel = next
    ? next.estimated
      ? whenText(next, today)
      : `${formatDate(next.date)}, ${whenText(next, today)}`
    : 'no upcoming date';
  const away = distanceKm === undefined ? '' : formatDistanceAway(distanceKm);
  const qualifierTitle = isQualifierChampionship(race);
  const nonStandard = isNearStandard(race);
  // The bike hint only joins a simple badge row (distance, TBC, countdown), so the row
  // still fits on one line on a 390px phone; qualifier/ballot, championship,
  // non-standard and estimated-date rows are full already. The shortlist shows the whole
  // course instead.
  const showBike =
    !showCourse &&
    !!race.bike &&
    race.entry === 'open' &&
    !qualifierTitle &&
    !nonStandard &&
    !!next &&
    !next.estimated &&
    !later;
  const label = [
    race.name,
    DISTANCES[race.distance].long,
    nonStandard && `non-standard distance ${legsText(raceLegs(race))}`,
    race.entry !== 'open' && ENTRY_BADGE[race.entry],
    `${race.city}, ${race.countryName}`,
    away,
    dateLabel,
    later && `next edition ${formatMonthShort(later.date)}`,
    showCourse && courseSummary(race),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <li
      data-race-id={race.id}
      onMouseEnter={() => onHover(race.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group relative flex gap-3 border-b border-line/70 px-4 py-3 transition-colors duration-150 [contain-intrinsic-size:auto_106px] [content-visibility:auto]',
        selected ? 'bg-accent-soft' : hovered ? 'bg-surface-2' : 'hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-2 left-0 w-1 rounded-r-full bg-ink transition-transform duration-200',
          selected ? 'scale-y-100' : 'scale-y-0',
        )}
      />
      <DateTile next={next} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
          <BrandGlyph brand={race.brand} size={15} hollow={next?.estimated} />
          <span className="truncate">{seriesLabel(race, BRANDS[race.brand].label)}</span>
        </div>
        <h4 className="mt-0.5 text-[15px] leading-snug font-semibold text-fg">
          <button
            type="button"
            onClick={() => onSelect(race.id)}
            onFocus={() => onHover(race.id)}
            onBlur={() => onHover(null)}
            aria-label={label}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-fg"
          >
            {race.name}
          </button>
        </h4>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          <Flag code={race.country} />
          <span className="truncate">
            {race.city}, {race.countryName}
          </span>
          {away && (
            <span className="tabular shrink-0 font-semibold whitespace-nowrap text-fg" data-testid="distance-away">
              · {away}
            </span>
          )}
        </p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <DistanceBadge distance={race.distance} course={race.course} />
          {showBike && <BikeHint terrain={race.bike!} />}
          <EntryBadge entry={race.entry} />
          <NonStandardBadge race={race} short />
          {qualifierTitle && <ChampionshipBadge race={race} />}
          <StatusBadge next={next} />
          <span
            className={cn(
              'tabular text-[12.5px] whitespace-nowrap',
              next?.estimated ? 'font-medium text-faint italic' : 'font-semibold text-fg',
            )}
          >
            {whenText(next, today)}
          </span>
          {later && (
            <span className="text-[12px] whitespace-nowrap text-muted" data-testid="also-next">
              (next: {formatMonthShort(later.date)})
            </span>
          )}
          {race.championship && !qualifierTitle && <ChampionshipBadge race={race} />}
        </div>
        {showCourse && <CourseLine race={race} />}
      </div>
      <button
        type="button"
        onClick={() => onToggleStar(race.id)}
        aria-pressed={starred}
        aria-label={starred ? `Remove ${race.name} from shortlist` : `Add ${race.name} to shortlist`}
        title={starred ? 'Remove from shortlist' : 'Add to shortlist'}
        className={cn(
          'relative z-[1] -mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full transition-[color,background-color,transform] before:absolute before:-inset-1 active:scale-90 pointer-coarse:-mt-2 pointer-coarse:size-11',
          starred ? 'text-amber-600 dark:text-amber-400' : 'text-muted hover:bg-surface-3 hover:text-fg',
        )}
      >
        <Star className={cn('size-[18px]', starred && 'fill-current')} strokeWidth={2} />
      </button>
    </li>
  );
});
