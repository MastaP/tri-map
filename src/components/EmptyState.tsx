import { SearchX } from 'lucide-react';
import type { Dimension, Filters, Relaxation } from '../lib/filters.ts';
import { TOUCH_INLINE } from '../lib/touch.ts';
import { cn } from '../lib/cn.ts';
import { estimatedHiddenText } from '../lib/raceText.ts';

const LABELS: Record<Dimension, (f: Filters) => string> = {
  q: (f) => `Clear the search “${f.q.trim()}”`,
  distance: () => 'Any distance',
  brand: () => 'Any brand',
  region: () => 'Any region',
  time: () => 'Any time',
  entry: () => 'Include qualifier-only and ballot races',
  soldout: () => 'Include sold-out and closed races',
  bike: () => 'Any bike course',
  run: () => 'Any run course',
  // Turning estimated dates on only adds races, so turning them off is never suggested.
  estimated: () => 'Hide estimated dates',
  area: () => 'Search the whole map, not just the visible area',
  shortlist: () => 'All races, not just your shortlist',
};

interface Props {
  filters: Filters;
  suggestions: Relaxation[];
  onRelax: (d: Dimension) => void;
  onClearAll: () => void;
  noData: boolean;
  /** Races hidden only because their course profile is unknown. */
  missingCourse?: number;
  /** Races that would match with estimated dates shown (their date is not announced yet). */
  estimatedHidden?: number;
  /** A date range or a year narrows the search ("usually held in this period"). */
  inPeriod?: boolean;
  onShowEstimated?: () => void;
}

export function EmptyState({
  filters,
  suggestions,
  onRelax,
  onClearAll,
  noData,
  missingCourse = 0,
  estimatedHidden = 0,
  inPeriod = false,
  onShowEstimated,
}: Props) {
  const anySuggestion = suggestions.length > 0 || estimatedHidden > 0;
  if (noData)
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-display text-xl font-bold uppercase">No race data yet</p>
        <p className="mt-2 text-sm text-muted">Add race files to data/races and rebuild.</p>
      </div>
    );
  return (
    <div className="animate-fade-in px-6 py-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
        <SearchX className="size-7" strokeWidth={1.8} />
      </div>
      <p className="mt-4 font-display text-xl font-bold tracking-wide uppercase">No races match</p>
      <p className="mx-auto mt-1 max-w-72 text-sm text-muted">
        {anySuggestion
          ? 'Loosen one filter to find your next race:'
          : filters.shortlistOnly
            ? 'Your shortlist is empty. Star the races you are weighing up to compare them here.'
            : 'Try a different search, a wider date range or fewer filters.'}
      </p>
      {missingCourse > 0 && (
        <p className="mx-auto mt-2 max-w-72 text-[13px] text-faint">
          {missingCourse} {missingCourse === 1 ? 'race was' : 'races were'} left out because their course profile is not
          in our data yet.
        </p>
      )}
      {estimatedHidden > 0 && (
        <p className="mx-auto mt-2 max-w-72 text-[13px] text-muted" data-testid="estimated-hidden">
          {estimatedHiddenText(estimatedHidden, inPeriod, false)}
        </p>
      )}
      {anySuggestion && (
        <ul className="mx-auto mt-4 flex max-w-80 flex-col gap-2">
          {estimatedHidden > 0 && (
            <li>
              <button
                type="button"
                onClick={onShowEstimated}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <span>Show estimated dates</span>
                <span className="tabular shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">
                  {estimatedHidden} {estimatedHidden === 1 ? 'race' : 'races'}
                </span>
              </button>
            </li>
          )}
          {suggestions.slice(0, estimatedHidden > 0 ? 2 : 3).map((s) => (
            <li key={s.dimension}>
              <button
                type="button"
                onClick={() => onRelax(s.dimension)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <span>{LABELS[s.dimension](filters)}</span>
                <span className="tabular shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">
                  {s.count} {s.count === 1 ? 'race' : 'races'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onClearAll}
        className={cn(
          'mt-4 text-sm font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg',
          TOUCH_INLINE,
        )}
      >
        Clear all filters
      </button>
    </div>
  );
}
