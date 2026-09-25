import { RotateCcw } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import type { SortKey } from '../lib/filters.ts';

interface Props {
  count: number;
  total: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  canClear: boolean;
  onClear: () => void;
}

export function ResultsToolbar({ count, total, sort, onSort, canClear, onClear }: Props) {
  return (
    <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur-md">
      <p className="text-sm text-muted" aria-live="polite" aria-atomic="true">
        <span className="tabular font-display text-[20px] leading-none font-bold text-fg">{count}</span>{' '}
        {count === 1 ? 'race' : 'races'}
        {count !== total && <span className="text-faint"> of {total}</span>}
      </p>
      {canClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <RotateCcw className="size-3.5" /> Clear filters
        </button>
      )}
      <div
        role="group"
        aria-label="Sort results"
        className="ml-auto flex rounded-lg bg-surface-2 p-0.5 text-[12px] font-semibold"
      >
        {(
          [
            ['date', 'Date'],
            ['name', 'A–Z'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={sort === key}
            onClick={() => onSort(key)}
            aria-label={key === 'date' ? 'Sort by date' : 'Sort by name'}
            className={cn(
              'h-6 rounded-md px-2 transition-colors',
              sort === key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
