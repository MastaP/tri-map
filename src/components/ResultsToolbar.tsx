import { LocateFixed, RotateCcw, Share2 } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import type { SortKey } from '../lib/filters.ts';

interface Props {
  count: number;
  total: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  canClear: boolean;
  onClear: () => void;
  /** Copy a link to the current search. */
  onShare: () => void;
  /** Announce the count (off while a modal filter sheet announces it instead). */
  live?: boolean;
}

/** Segmented control: the active segment is raised with an outline visible in both themes. */
const segment = (active: boolean) =>
  cn(
    'inline-flex h-6 items-center gap-1 rounded-md px-2 whitespace-nowrap transition-colors pointer-coarse:h-10 pointer-coarse:px-2.5',
    active
      ? 'bg-surface text-fg shadow-card ring-1 ring-line-strong ring-inset dark:bg-surface-3 dark:ring-fg/45'
      : 'text-muted hover:text-fg',
  );

export function ResultsToolbar({ count, total, sort, onSort, canClear, onClear, onShare, live = true }: Props) {
  return (
    <div className="@container sticky top-0 z-10 flex h-[var(--tm-toolbar-h)] items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur-md">
      <p
        className="text-sm whitespace-nowrap text-muted"
        aria-live={live ? 'polite' : undefined}
        aria-atomic="true"
        data-testid="result-count"
      >
        <span className="tabular font-display text-[20px] leading-none font-bold text-fg">{count}</span>{' '}
        {count === 1 ? 'race' : 'races'}
        {/* "of N" is dropped in a narrow list so the sort control still fits. */}
        {count !== total && <span className="text-faint @max-[25rem]:sr-only"> of {total}</span>}
      </p>
      {canClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-medium whitespace-nowrap text-muted transition-colors hover:bg-surface-2 hover:text-fg pointer-coarse:h-10"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" /> Clear
          <span className="@max-[27rem]:sr-only"> filters</span>
        </button>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onShare}
          aria-label="Share this search"
          title="Copy a link to this search"
          className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg pointer-coarse:size-10"
        >
          <Share2 className="size-4" />
        </button>
        <div
          role="group"
          aria-label="Sort results"
          className="flex shrink-0 rounded-lg bg-surface-2 p-0.5 text-[12px] font-semibold"
        >
          {(
            [
              ['date', 'Date', 'Date: soonest first'],
              ['name', 'A–Z', 'A–Z: by name'],
              ['near', 'Nearest', 'Nearest first: from your location if you allow it, else the map centre'],
            ] as const
          ).map(([key, label, title]) => (
            <button
              key={key}
              type="button"
              aria-pressed={sort === key}
              onClick={() => onSort(key)}
              title={title}
              className={segment(sort === key)}
            >
              {key === 'near' && <LocateFixed className="size-3" strokeWidth={2.4} aria-hidden="true" />}
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
