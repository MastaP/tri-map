import { SearchX } from 'lucide-react';
import type { Dimension, Filters, Relaxation } from '../lib/filters.ts';

const LABELS: Record<Dimension, (f: Filters) => string> = {
  q: (f) => `Clear the search “${f.q.trim()}”`,
  distance: () => 'Any distance',
  brand: () => 'Any brand',
  region: () => 'Any region',
  time: () => 'Any time',
  estimated: () => 'Include estimated dates',
  area: () => 'Search the whole map, not just the visible area',
  shortlist: () => 'All races, not just your shortlist',
};

interface Props {
  filters: Filters;
  suggestions: Relaxation[];
  onRelax: (d: Dimension) => void;
  onClearAll: () => void;
  noData: boolean;
}

export function EmptyState({ filters, suggestions, onRelax, onClearAll, noData }: Props) {
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
        {suggestions.length
          ? 'Loosen one filter to bring races back:'
          : filters.shortlistOnly
            ? 'Your shortlist is empty. Star races to add them.'
            : 'Try a different search or fewer filters.'}
      </p>
      {suggestions.length > 0 && (
        <ul className="mx-auto mt-4 flex max-w-80 flex-col gap-2">
          {suggestions.slice(0, 3).map((s) => (
            <li key={s.dimension}>
              <button
                type="button"
                onClick={() => onRelax(s.dimension)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:border-line-strong hover:bg-surface-2"
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
        className="mt-4 text-sm font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
      >
        Clear all filters
      </button>
    </div>
  );
}
