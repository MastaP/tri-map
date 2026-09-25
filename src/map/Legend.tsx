import { ChevronDown } from 'lucide-react';
import { BRAND_IDS, BRANDS, brandGlyphSvg, type BrandId } from '../data/brands.ts';
import { cn } from '../lib/cn.ts';

interface Props {
  brandFilter: BrandId[];
  counts: Record<BrandId, number>;
  onToggle: (b: BrandId) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

function Glyph({
  brand,
  hollow,
  halo,
  size = 22,
}: {
  brand: BrandId;
  hollow?: boolean;
  halo?: boolean;
  size?: number;
}) {
  return (
    <span
      className="inline-block shrink-0 [&>svg]:size-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: brandGlyphSvg(brand, { hollow, halo, ring: 'var(--tm-surface)' }) }}
    />
  );
}

/** Map legend. Brand rows double as the brand filter (same state as the chips). */
export function Legend({ brandFilter, counts, onToggle, open, onOpenChange, className }: Props) {
  const allOn = brandFilter.length === 0;
  return (
    <div
      className={cn(
        'absolute z-10 overflow-hidden rounded-2xl border border-line bg-surface/95 text-[13px] shadow-card backdrop-blur',
        open ? 'w-52' : 'w-auto',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 px-3 font-display text-[12px] font-bold tracking-[0.12em] text-muted uppercase hover:text-fg"
      >
        {!open && (
          <span className="-ml-1 flex -space-x-1.5" aria-hidden="true">
            {BRAND_IDS.map((b) => (
              <Glyph key={b} brand={b} size={16} />
            ))}
          </span>
        )}
        Legend
        <ChevronDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-line px-1.5 pt-1 pb-2">
          <div role="group" aria-label="Brands (click to filter)">
            {BRAND_IDS.map((b) => {
              const active = allOn || brandFilter.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={brandFilter.includes(b)}
                  onClick={() => onToggle(b)}
                  title={`${BRANDS[b].description}: click to ${brandFilter.includes(b) ? 'remove from' : 'filter by'} brand`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface-2',
                    !active && 'text-faint',
                  )}
                >
                  <span className={cn('transition-[opacity,filter]', !active && 'opacity-35 grayscale')}>
                    <Glyph brand={b} />
                  </span>
                  <span className={cn('flex-1 font-medium', !active && 'line-through decoration-1')}>
                    {BRANDS[b].label}
                  </span>
                  <span className="tabular text-[11px] font-semibold text-faint">{counts[b]}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1 border-t border-line px-0.5 pt-2 text-center text-[10.5px] leading-tight text-muted">
            <p className="flex flex-col items-center gap-0.5">
              <Glyph brand="ironman" halo size={24} />
              Outer ring = full
            </p>
            <p className="flex flex-col items-center gap-0.5">
              <Glyph brand="challenge" hollow size={24} />
              Dashed = date estimated
            </p>
            <p className="flex flex-col items-center gap-0.5">
              <span className="grid size-6 place-items-center">
                <span className="size-[18px] rounded-full border-[4px] border-t-ironman border-r-challenge border-b-t100 border-l-independent" />
              </span>
              Donut = brand mix
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
