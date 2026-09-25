import { ChevronDown, CircleHelp, Hourglass } from 'lucide-react';
import { memo, useEffect, useState, type ReactNode } from 'react';
import type { NextEdition } from '../data/nextEdition.ts';
import type { Race } from '../data/types.ts';
import { cn } from '../lib/cn.ts';
import { daysBetween, formatMonthLong, type ISODate } from '../lib/dates.ts';
import { whenIdle } from '../lib/idle.ts';
import { groupByMonth, type SortKey } from '../lib/filters.ts';
import { RaceCard } from './RaceCard.tsx';

/** Races starting this soon are usually too late to enter and train for. */
export const SOON_DAYS = 21;
/** Cards rendered before the first paint; the rest follow when the browser is idle. */
const FIRST_BATCH = 30;

interface Props {
  races: Race[];
  /** The edition each race is shown with (see shownEditions). */
  shown: ReadonlyMap<string, NextEdition>;
  sort: SortKey;
  today: ISODate;
  selectedId: string | null;
  hoveredId: string | null;
  shortlist: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onToggleStar: (id: string) => void;
  /** km from the "Nearest" origin, per race id; null unless that sort has an origin. */
  distances?: ReadonlyMap<string, number> | null;
  /** Fold races in the next three weeks into a closed group at the top. */
  foldSoon?: boolean;
  /** Show every card's swim / bike / run profile (shortlist comparison). */
  showCourse?: boolean;
  /** Races a course filter hid because their profile is unknown, listed on request. */
  missingCourse?: Race[];
  missingOpen?: boolean;
  onMissingOpenChange?: (open: boolean) => void;
}

function useIdleFlag(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => whenIdle(() => setDone(true), 600), []);
  return done;
}

function Fold({
  id,
  open,
  onToggle,
  icon,
  title,
  hint,
  count,
  children,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="border-b border-line" id={id}>
      <h3 id={`${id}-title`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onClick={onToggle}
          className="flex w-full items-center gap-3 bg-surface-2/70 px-4 py-2 text-left transition-colors hover:bg-surface-2"
        >
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-muted"
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-display text-[14px] font-bold tracking-[0.08em] text-fg uppercase">{title}</span>
              <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] leading-[18px] font-semibold text-muted">
                {count}
              </span>
            </span>
            <span className="block text-[12px] leading-snug text-muted">{hint}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
        </button>
      </h3>
      <div id={`${id}-list`} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

export const ResultsList = memo(function ResultsList({
  races,
  shown,
  sort,
  today,
  selectedId,
  hoveredId,
  shortlist,
  onSelect,
  onHover,
  onToggleStar,
  distances = null,
  foldSoon = false,
  showCourse = false,
  missingCourse = [],
  missingOpen = false,
  onMissingOpenChange,
}: Props) {
  const idle = useIdleFlag();
  const [soonOpen, setSoonOpen] = useState(false);

  const card = (r: Race) => (
    <RaceCard
      key={r.id}
      race={r}
      edition={shown.get(r.id) ?? r.nextEdition}
      today={today}
      selected={r.id === selectedId}
      hovered={r.id === hoveredId}
      starred={shortlist.has(r.id)}
      onSelect={onSelect}
      onHover={onHover}
      onToggleStar={onToggleStar}
      distanceKm={distances?.get(r.id)}
      showCourse={showCourse}
    />
  );

  const missing =
    missingCourse.length > 0 ? (
      <Fold
        id="missing-course"
        open={missingOpen}
        onToggle={() => onMissingOpenChange?.(!missingOpen)}
        icon={<CircleHelp className="size-4" />}
        title="Course not listed yet"
        hint="These match your other filters, but we have no course profile for them yet."
        count={missingCourse.length}
      >
        <ul aria-label="Races without a course profile">{missingCourse.map(card)}</ul>
      </Fold>
    ) : null;

  const visible = idle ? races : races.slice(0, FIRST_BATCH);

  if (sort === 'name' || (sort === 'near' && distances)) {
    return (
      <>
        <ul aria-label={sort === 'name' ? 'Races, A to Z' : 'Races, nearest first'}>{visible.map(card)}</ul>
        {missing}
      </>
    );
  }

  // Date order: races in the next three weeks fold away (you can rarely still enter and
  // train for them), unless that is all there is or one of them is open.
  const isSoon = (r: Race) => {
    const e = shown.get(r.id) ?? r.nextEdition;
    return !!e && !e.estimated && daysBetween(today, e.date) < SOON_DAYS;
  };
  const soon = foldSoon ? races.filter(isSoon) : [];
  const fold = soon.length > 0 && soon.length < races.length;
  const open = soonOpen || (!!selectedId && soon.some((r) => r.id === selectedId));
  const rest = fold ? races.filter((r) => !isSoon(r)) : races;
  // Month headers count every race; before the idle callback only the first cards render.
  const months: { key: string; count: number; cards: Race[] }[] = [];
  let budget = idle ? Infinity : FIRST_BATCH;
  for (const g of groupByMonth(rest, shown, today)) {
    if (budget <= 0) break;
    const cards = g.races.slice(0, budget);
    budget -= cards.length;
    months.push({ key: g.key, count: g.races.length, cards });
  }

  return (
    <div>
      {fold && (
        <Fold
          id="racing-soon"
          open={open}
          onToggle={() => setSoonOpen(!open)}
          icon={<Hourglass className="size-4" />}
          title="Next 3 weeks"
          hint="Usually too late to enter and train for."
          count={soon.length}
        >
          <ul aria-label="Races in the next 3 weeks">{soon.map(card)}</ul>
        </Fold>
      )}
      {months.map((g) => {
        const id = `month-${g.key}`;
        return (
          <section key={g.key} aria-labelledby={id}>
            <h3
              id={id}
              className="sticky top-[var(--tm-toolbar-h)] z-[5] flex items-center gap-2 border-b border-line bg-bg/95 px-4 py-1.5 backdrop-blur-md"
            >
              <span className="font-display text-[14px] font-bold tracking-[0.08em] text-fg uppercase">
                {g.key === 'tba' ? 'Date TBA' : formatMonthLong(g.key)}
              </span>
              <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] leading-[18px] font-semibold text-muted">
                {g.count}
              </span>
            </h3>
            <ul>{g.cards.map(card)}</ul>
          </section>
        );
      })}
      {missing}
    </div>
  );
});
