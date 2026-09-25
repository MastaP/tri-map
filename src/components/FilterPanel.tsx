import { CircleDashed, Crosshair, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { BRAND_IDS, BRANDS, DISTANCE_IDS, DISTANCES } from '../data/brands.ts';
import { REGION_IDS, REGIONS } from '../data/regions.ts';
import { cn } from '../lib/cn.ts';
import type { ISODate } from '../lib/dates.ts';
import { toggleValue, type FacetCounts, type Filters, type MonthBucket } from '../lib/filters.ts';
import { BrandGlyph } from './BrandGlyph.tsx';
import { Chip, ToggleChip } from './Chip.tsx';
import { TimeFilter } from './TimeFilter.tsx';

interface Props {
  filters: Filters;
  onChange: (update: (f: Filters) => Filters) => void;
  facets: FacetCounts;
  buckets: MonthBucket[];
  anyTimeCount: number;
  today: ISODate;
  shortlistCount: number;
  /** "Only in map area" needs a map that has reported its viewport. */
  mapAvailable: boolean;
}

export function SectionTitle({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
      <h3 id={id} className="font-display text-[12px] font-bold tracking-[0.14em] text-muted uppercase">
        {children}
      </h3>
      {aside}
    </div>
  );
}

const tile =
  'group flex min-w-0 flex-col rounded-xl border px-2.5 py-1.5 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]';
const tileOn = 'border-ink bg-ink text-on-ink';
const tileOff = 'border-line bg-surface hover:border-line-strong hover:bg-surface-2';

export function FilterPanel({
  filters,
  onChange,
  facets,
  buckets,
  anyTimeCount,
  today,
  shortlistCount,
  mapAvailable,
}: Props) {
  return (
    <div className="divide-y divide-line">
      <section aria-labelledby="f-distance" className="py-2.5">
        <SectionTitle id="f-distance">Distance</SectionTitle>
        <div role="group" aria-labelledby="f-distance" className="grid grid-cols-3 gap-1.5">
          {DISTANCE_IDS.map((d) => {
            const info = DISTANCES[d];
            const pressed = filters.distances.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={pressed}
                aria-label={`${info.long} (${info.swim} / ${info.bike} / ${info.run} km), ${facets.distance[d]} races`}
                onClick={() => onChange((f) => ({ ...f, distances: toggleValue(f.distances, d, DISTANCE_IDS) }))}
                className={cn(tile, pressed ? tileOn : tileOff)}
              >
                <span className="flex w-full items-baseline justify-between gap-1">
                  <span className="font-display text-[16px] leading-tight font-bold tracking-wide uppercase">
                    {info.label}
                  </span>
                  <span className={cn('tabular text-[11px] font-semibold', pressed ? 'text-on-ink/65' : 'text-faint')}>
                    {facets.distance[d]}
                  </span>
                </span>
                <span
                  className={cn(
                    'tabular text-[11px] leading-tight whitespace-nowrap',
                    pressed ? 'text-on-ink/75' : 'text-muted',
                  )}
                >
                  {info.swim} · {info.bike} · {info.run}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="f-brand" className="py-2.5">
        <SectionTitle id="f-brand">Brand</SectionTitle>
        <div role="group" aria-labelledby="f-brand" className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-4">
          {BRAND_IDS.map((b) => {
            const pressed = filters.brands.includes(b);
            return (
              <button
                key={b}
                type="button"
                aria-pressed={pressed}
                aria-label={`${BRANDS[b].label}: ${BRANDS[b].description}, ${facets.brand[b]} races`}
                title={BRANDS[b].description}
                onClick={() => onChange((f) => ({ ...f, brands: toggleValue(f.brands, b, BRAND_IDS) }))}
                className={cn(tile, 'gap-0.5', pressed ? tileOn : tileOff)}
              >
                <span className="flex w-full items-center justify-between">
                  <BrandGlyph brand={b} size={20} />
                  <span className={cn('tabular text-[11px] font-semibold', pressed ? 'text-on-ink/65' : 'text-faint')}>
                    {facets.brand[b]}
                  </span>
                </span>
                <span className="truncate text-[12px] font-semibold">{BRANDS[b].label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="f-region" className="py-2.5">
        <SectionTitle id="f-region">Region</SectionTitle>
        <div role="group" aria-labelledby="f-region" className="flex flex-wrap gap-1.5">
          {REGION_IDS.map((r) => (
            <Chip
              key={r}
              pressed={filters.regions.includes(r)}
              count={facets.region[r]}
              onClick={() => onChange((f) => ({ ...f, regions: toggleValue(f.regions, r, REGION_IDS) }))}
            >
              {REGIONS[r].label}
            </Chip>
          ))}
        </div>
      </section>

      <section aria-labelledby="f-when" className="py-2.5">
        <TimeFilter
          titleId="f-when"
          buckets={buckets}
          anyTimeCount={anyTimeCount}
          time={filters.time}
          today={today}
          showEstimated={filters.showEstimated}
          onChange={(time) => onChange((f) => ({ ...f, time }))}
        />
      </section>

      <div className="flex flex-wrap gap-1.5 py-2.5">
        <ToggleChip
          checked={filters.showEstimated}
          onChange={(v) => onChange((f) => ({ ...f, showEstimated: v }))}
          title="Include races whose next date is not announced yet (estimated from the last edition)"
          icon={<CircleDashed className="size-3" />}
        >
          Estimated dates
        </ToggleChip>
        <ToggleChip
          checked={filters.inMapArea}
          onChange={(v) => onChange((f) => ({ ...f, inMapArea: v }))}
          title={mapAvailable ? 'Only list races inside the visible map area' : 'Applies once the map has loaded'}
          icon={<Crosshair className="size-3" />}
        >
          In map area
        </ToggleChip>
        <ToggleChip
          checked={filters.shortlistOnly}
          onChange={(v) => onChange((f) => ({ ...f, shortlistOnly: v }))}
          title="Only show races you starred"
          icon={<Star className="size-3" />}
        >
          Shortlist
          <span className="tabular text-[11px] font-semibold text-faint">{shortlistCount}</span>
        </ToggleChip>
      </div>
    </div>
  );
}
