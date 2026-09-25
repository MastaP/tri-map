import { X } from 'lucide-react';
import { BRANDS } from '../data/brands.ts';
import { REGIONS } from '../data/regions.ts';
import type { Dimension, Filters } from '../lib/filters.ts';
import { TERRAIN_LABEL } from '../lib/raceText.ts';

/** Dimensions that live behind the "Filters" button on desktop. */
const HIDDEN_DIMENSIONS: readonly Dimension[] = [
  'region',
  'bike',
  'run',
  'entry',
  'estimated',
  'area',
  'shortlist',
  'brand',
];

function describe(d: Dimension, f: Filters): string {
  const list = (xs: readonly string[]) => xs.join(', ');
  switch (d) {
    case 'region':
      return list(f.regions.map((r) => REGIONS[r].label));
    case 'brand':
      return list(f.brands.map((b) => BRANDS[b].label));
    case 'bike':
      return `Bike: ${list(f.bike.map((t) => TERRAIN_LABEL[t].toLowerCase()))}`;
    case 'run':
      return `Run: ${list(f.run.map((t) => TERRAIN_LABEL[t].toLowerCase()))}`;
    case 'entry':
      return 'Open entry only';
    case 'estimated':
      return 'Estimated dates';
    case 'area':
      return 'In map area';
    case 'shortlist':
      return 'Shortlist';
    default:
      return d;
  }
}

/**
 * While the filter panel is closed, the filters set inside it stay visible as removable
 * chips, so a narrowed list never looks like the full one.
 */
export function ActiveFilters({
  filters,
  active,
  onClear,
}: {
  filters: Filters;
  active: readonly Dimension[];
  onClear: (d: Dimension) => void;
}) {
  const shown = HIDDEN_DIMENSIONS.filter((d) => active.includes(d));
  if (!shown.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 pb-3" aria-label="Other active filters">
      {shown.map((d) => {
        const text = describe(d, filters);
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onClear(d)}
              aria-label={`${text}: remove filter`}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-accent-soft pr-2 pl-2.5 text-[12px] font-medium text-fg ring-1 ring-ink/15 transition-colors ring-inset hover:ring-ink/40 dark:ring-accent/40 pointer-coarse:h-11"
            >
              <span className="truncate">{text}</span>
              <X className="size-3.5 shrink-0 text-muted" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
