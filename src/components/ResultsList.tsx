import { memo } from 'react';
import type { Race } from '../data/types.ts';
import { formatMonthLong, type ISODate } from '../lib/dates.ts';
import { groupByMonth, type SortKey } from '../lib/filters.ts';
import { RaceCard } from './RaceCard.tsx';

interface Props {
  races: Race[];
  sort: SortKey;
  today: ISODate;
  selectedId: string | null;
  hoveredId: string | null;
  shortlist: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onToggleStar: (id: string) => void;
  /** Offset (px) of the sticky month headers, below the sticky toolbar. */
  stickyTop?: number;
}

export const ResultsList = memo(function ResultsList({
  races,
  sort,
  today,
  selectedId,
  hoveredId,
  shortlist,
  onSelect,
  onHover,
  onToggleStar,
  stickyTop = 48,
}: Props) {
  const card = (r: Race) => (
    <RaceCard
      key={r.id}
      race={r}
      today={today}
      selected={r.id === selectedId}
      hovered={r.id === hoveredId}
      starred={shortlist.has(r.id)}
      onSelect={onSelect}
      onHover={onHover}
      onToggleStar={onToggleStar}
    />
  );

  if (sort === 'name') return <ul aria-label="Races, A to Z">{races.map(card)}</ul>;

  return (
    <div>
      {groupByMonth(races).map((g) => {
        const id = `month-${g.key}`;
        return (
          <section key={g.key} aria-labelledby={id}>
            <h3
              id={id}
              className="sticky z-[5] flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-1.5 backdrop-blur-md"
              style={{ top: stickyTop }}
            >
              <span className="font-display text-[14px] font-bold tracking-[0.08em] text-fg uppercase">
                {g.key === 'tba' ? 'Date TBA' : formatMonthLong(g.key)}
              </span>
              <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] leading-[18px] font-semibold text-muted">
                {g.races.length}
              </span>
            </h3>
            <ul>{g.races.map(card)}</ul>
          </section>
        );
      })}
    </div>
  );
});
