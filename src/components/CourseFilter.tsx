import { Bike, Footprints, type LucideIcon } from 'lucide-react';
import { TERRAINS, type Terrain } from '../data/constants.ts';
import { cn } from '../lib/cn.ts';
import type { CourseDimension } from '../lib/filters.ts';
import { TERRAIN_LABEL } from '../lib/raceText.ts';
import { TerrainGlyph } from './RaceBits.tsx';

interface Props {
  titleId: string;
  bike: readonly Terrain[];
  run: readonly Terrain[];
  counts: Record<CourseDimension, Record<Terrain, number>>;
  /** Races hidden only because their course profile is unknown (0 when no course filter). */
  missing: number;
  onToggle: (dim: CourseDimension, terrain: Terrain) => void;
}

const ROWS: ReadonlyArray<{ dim: CourseDimension; label: string; group: string; Icon: LucideIcon }> = [
  { dim: 'bike', label: 'Bike', group: 'Bike course', Icon: Bike },
  { dim: 'run', label: 'Run', group: 'Run course', Icon: Footprints },
];

const GRID = 'grid grid-cols-[3.25rem_repeat(4,minmax(0,1fr))] items-center gap-1.5';

/**
 * Bike and run course profile filters as a 2 × 4 matrix: the column headings name the
 * profile once, each cell toggles it for that discipline (multi-select, OR within a row).
 */
export function CourseFilter({ titleId, bike, run, counts, missing, onToggle }: Props) {
  const selected = { bike, run };
  return (
    <div>
      {/* The section title doubles as the corner cell of the column headings. */}
      <div className={cn(GRID, 'mb-1.5 min-h-5')}>
        <h3 id={titleId} className="font-display text-[12px] font-bold tracking-[0.14em] text-muted uppercase">
          Course
        </h3>
        {TERRAINS.map((t) => (
          <span
            key={t}
            className="text-center text-[10.5px] leading-tight font-medium break-words hyphens-manual text-muted"
            aria-hidden="true"
          >
            {/* Soft hyphen: "Mountainous" breaks as "Moun-tainous" in a narrow sheet. */}
            {t === 'mountainous' ? 'Moun\u00ADtainous' : TERRAIN_LABEL[t]}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {ROWS.map(({ dim, label, group, Icon }) => (
          <div key={dim} role="group" aria-label={group} className={GRID}>
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg" aria-hidden="true">
              <Icon className="size-3.5 text-muted" strokeWidth={2.2} />
              {label}
            </span>
            {TERRAINS.map((t) => {
              const pressed = selected[dim].includes(t);
              const n = counts[dim][t];
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`${group}: ${TERRAIN_LABEL[t]}, ${n} ${n === 1 ? 'race' : 'races'}`}
                  title={`${group}: ${TERRAIN_LABEL[t].toLowerCase()}`}
                  onClick={() => onToggle(dim, t)}
                  className={cn(
                    'flex h-8 min-w-0 items-center justify-between gap-1 rounded-lg border px-2 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] pointer-coarse:h-11',
                    pressed
                      ? 'border-ink bg-ink text-on-ink'
                      : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2',
                    !pressed && n === 0 && 'text-faint',
                  )}
                >
                  <TerrainGlyph terrain={t} />
                  <span className={cn('tabular text-[11px] font-semibold', pressed ? 'text-on-ink/70' : 'text-faint')}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {missing > 0 && (
        <p className="mt-1.5 text-[11.5px] text-faint">
          {missing} {missing === 1 ? 'race has' : 'races have'} no course profile in our data yet and{' '}
          {missing === 1 ? 'is' : 'are'} hidden.
        </p>
      )}
    </div>
  );
}
