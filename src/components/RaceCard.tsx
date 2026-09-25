import { Star } from 'lucide-react';
import { memo } from 'react';
import { BRANDS } from '../data/brands.ts';
import type { Race } from '../data/types.ts';
import { cn } from '../lib/cn.ts';
import { formatDate, type ISODate } from '../lib/dates.ts';
import { BrandGlyph } from './BrandGlyph.tsx';
import { Flag } from './Flag.tsx';
import { whenText } from '../lib/raceText.ts';
import { ChampionshipBadge, DateTile, DistanceBadge, StatusBadge } from './RaceBits.tsx';

interface Props {
  race: Race;
  today: ISODate;
  selected: boolean;
  hovered: boolean;
  starred: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onToggleStar: (id: string) => void;
}

export const RaceCard = memo(function RaceCard({
  race,
  today,
  selected,
  hovered,
  starred,
  onSelect,
  onHover,
  onToggleStar,
}: Props) {
  const next = race.nextEdition;
  const dateLabel = next
    ? next.estimated
      ? whenText(next, today)
      : `${formatDate(next.date)}, ${whenText(next, today)}`
    : 'no upcoming date';
  return (
    <li
      data-race-id={race.id}
      onMouseEnter={() => onHover(race.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group relative flex gap-3 border-b border-line/70 px-4 py-3 transition-colors duration-150',
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
          <span className="truncate">{race.series ?? BRANDS[race.brand].label}</span>
        </div>
        <h4 className="mt-0.5 text-[15px] leading-snug font-semibold text-fg">
          <button
            type="button"
            onClick={() => onSelect(race.id)}
            onFocus={() => onHover(race.id)}
            onBlur={() => onHover(null)}
            aria-label={`${race.name}, ${race.distance === 't100' ? 'T100' : race.distance} distance, ${race.city}, ${race.countryName}, ${dateLabel}`}
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
        </p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <DistanceBadge distance={race.distance} />
          {race.championship && <ChampionshipBadge title={race.championship} />}
          <StatusBadge next={next} />
          <span className={cn('text-[12px] font-medium', next?.estimated ? 'text-faint italic' : 'text-muted')}>
            {whenText(next, today)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onToggleStar(race.id)}
        aria-pressed={starred}
        aria-label={starred ? `Remove ${race.name} from shortlist` : `Add ${race.name} to shortlist`}
        title={starred ? 'Remove from shortlist' : 'Add to shortlist'}
        className={cn(
          'relative z-[1] -mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full transition-[color,background-color,transform] active:scale-90',
          starred
            ? 'text-independent'
            : 'text-faint opacity-60 group-hover:opacity-100 hover:bg-surface-3 hover:text-fg focus-visible:opacity-100',
        )}
      >
        <Star className={cn('size-[18px]', starred && 'fill-current')} strokeWidth={2} />
      </button>
    </li>
  );
});
