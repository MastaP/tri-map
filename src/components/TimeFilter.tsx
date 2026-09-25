import { X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../lib/cn.ts';
import { formatMonthLong, formatMonthShort, monthAbbrev, type ISODate } from '../lib/dates.ts';
import {
  describeTime,
  presetLabel,
  presetShortLabel,
  racesInBuckets,
  resolveTimeRange,
  TIME_PRESETS,
  type MonthBucket,
  type TimeFilter as TimeFilterValue,
} from '../lib/filters.ts';
import { Chip } from './Chip.tsx';

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;

/** Bucket indices covered by the drag in progress or the committed range ([-1,-1] = none). */
function selectionIndices(
  keys: string[],
  committed: { from: string; to: string } | null,
  drag: { anchor: number; current: number } | null,
): [number, number] {
  if (drag) return [Math.min(drag.anchor, drag.current), Math.max(drag.anchor, drag.current)];
  if (!committed) return [-1, -1];
  const from = keys.findIndex((k) => k >= committed.from);
  let to = -1;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i]! <= committed.to) {
      to = i;
      break;
    }
  }
  return from === -1 || to === -1 || to < from ? [-2, -2] : [from, to];
}

function rangeText(keys: string[], from: number, to: number): string {
  return from === to
    ? formatMonthShort(keys[from]!)
    : `${formatMonthShort(keys[from]!)} – ${formatMonthShort(keys[to]!)}`;
}

/**
 * Quick date presets as chips. They toggle like the other filter chips (none pressed =
 * any time); a custom month range picked on the histogram shows as its own chip.
 */
export function TimePresets({
  time,
  today,
  onChange,
  className,
}: {
  time: TimeFilterValue;
  today: ISODate;
  onChange: (t: TimeFilterValue) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="When" className={cn('flex flex-wrap gap-1.5', className)}>
      {time.kind === 'range' && (
        <Chip pressed onClick={() => onChange({ kind: 'any' })} label={`${describeTime(time, today)}, clear dates`}>
          <span className="inline-flex items-center gap-1">
            {describeTime(time, today)}
            <X className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </Chip>
      )}
      {TIME_PRESETS.map((p) => {
        const pressed = time.kind === 'preset' && time.preset === p;
        const short = presetShortLabel(p, today);
        const long = presetLabel(p, today);
        return (
          <Chip
            key={p}
            pressed={pressed}
            onClick={() => onChange(pressed ? { kind: 'any' } : { kind: 'preset', preset: p })}
            title={long}
            // The accessible name starts with the visible text (label in name).
            label={short === long ? undefined : `${short}: ${long.toLowerCase()}`}
          >
            {short}
          </Chip>
        );
      })}
    </div>
  );
}

interface HistogramProps {
  titleId: string;
  buckets: MonthBucket[];
  /** Races matching every other filter, including ones without any date. */
  anyTimeCount: number;
  time: TimeFilterValue;
  today: ISODate;
  showEstimated: boolean;
  onChange: (t: TimeFilterValue) => void;
}

/**
 * Month histogram (bar height = races held that month, matching the other filters) with
 * click / drag / keyboard range selection. The committed selection is always shown in
 * the heading; hovering or dragging shows a tooltip above the bars.
 */
export function MonthHistogram({
  titleId,
  buckets,
  anyTimeCount,
  time,
  today,
  showEstimated,
  onChange,
}: HistogramProps) {
  const barsRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [drag, setDrag] = useState<{ anchor: number; current: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const keyAnchor = useRef<number | null>(null);

  const keys = buckets.map((b) => b.key);
  const n = buckets.length;
  const total = (b: MonthBucket) => b.count + (showEstimated ? b.estimated : 0);
  const max = Math.max(1, ...buckets.map(total));

  const committed = resolveTimeRange(time, today);
  const [selFrom, selTo] = selectionIndices(keys, committed, drag);
  const hasSel = selFrom >= 0;
  const [comFrom, comTo] = selectionIndices(keys, committed, null);

  const commit = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const from = keys[lo]!;
    const to = keys[hi]!;
    if (committed && lo === hi && committed.from === from && committed.to === to) onChange({ kind: 'any' });
    else onChange({ kind: 'range', from, to });
  };

  const indexAt = (clientX: number) => {
    const rect = barsRef.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * n)));
  };

  // The drag lives in a ref too: pointermove updates may not have rendered yet when
  // pointerup arrives, so the handlers must not read it from render state.
  const dragRef = useRef<{ anchor: number; current: number } | null>(null);
  const setDragBoth = (d: { anchor: number; current: number } | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !n) return;
    const i = indexAt(e.clientX);
    setDragBoth({ anchor: i, current: i });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!n) return;
    const i = indexAt(e.clientX);
    if (e.pointerType === 'mouse') setHover(i);
    const d = dragRef.current;
    if (d && d.current !== i) setDragBoth({ ...d, current: i });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    commit(d.anchor, d.current);
    setFocusIdx(d.current);
    setDragBoth(null);
    if (e.pointerType !== 'mouse') setHover(null);
  };

  const moveFocus = (i: number) => {
    const next = Math.min(n - 1, Math.max(0, i));
    setFocusIdx(next);
    buttonRefs.current[next]?.focus();
    return next;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      e.preventDefault();
      const next = moveFocus(i + step);
      if (e.shiftKey) {
        keyAnchor.current ??= hasSel ? (step > 0 ? selFrom : selTo) : i;
        commit(keyAnchor.current, next);
      } else keyAnchor.current = null;
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      moveFocus(e.key === 'Home' ? 0 : n - 1);
    }
  };

  // Heading: the committed selection, always (0 races when it lies outside the axis).
  const committedCount = !committed
    ? anyTimeCount
    : comFrom >= 0
      ? racesInBuckets(buckets, comFrom, comTo, showEstimated)
      : 0;
  const summary = `${describeTime(time, today)} · ${plural(committedCount, 'race')}`;

  // Tooltip: the range being dragged, else the hovered month.
  let tip: { at: number; text: string } | null = null;
  if (drag) {
    tip = {
      at: (selFrom + selTo) / 2,
      text: `${rangeText(keys, selFrom, selTo)} · ${plural(racesInBuckets(buckets, selFrom, selTo, showEstimated), 'race')}`,
    };
  } else if (hover !== null && buckets[hover]) {
    const b = buckets[hover];
    tip = {
      at: hover,
      text: `${formatMonthLong(b.key)} · ${plural(total(b), 'race')}${showEstimated && b.estimated ? ` (${b.estimated} est.)` : ''}`,
    };
  }

  const showEvery = n > 18 ? 2 : 1;

  return (
    <div>
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
        <h3 id={titleId} className="font-display text-[12px] font-bold tracking-[0.14em] text-muted uppercase">
          When
        </h3>
        <p className="tabular flex min-w-0 items-center gap-1 text-[12px] text-muted" data-testid="time-summary">
          <span className="truncate">{summary}</span>
          {time.kind !== 'any' && (
            <button
              type="button"
              onClick={() => onChange({ kind: 'any' })}
              aria-label="Clear dates"
              title="Clear dates"
              className="relative grid size-5 shrink-0 place-items-center rounded-full text-muted before:absolute before:-inset-2 hover:bg-surface-3 hover:text-fg"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          )}
        </p>
      </div>

      <div className="relative">
        {tip && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11.5px] font-semibold whitespace-nowrap text-on-ink shadow-float"
            style={{ left: `clamp(4.5rem, ${((tip.at + 0.5) / n) * 100}%, calc(100% - 4.5rem))` }}
            aria-hidden="true"
            data-testid="histogram-tip"
          >
            {tip.text}
          </div>
        )}
        <div
          ref={barsRef}
          role="group"
          aria-label="Races per month. Click a month, or drag across months, to filter by date. Shift and arrow keys extend the range."
          className="relative flex h-14 touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDragBoth(null)}
          onPointerLeave={() => setHover(null)}
        >
          {buckets.map((b, i) => {
            const selected = hasSel && i >= selFrom && i <= selTo;
            const dim = hasSel && !selected;
            const h = (b.count / max) * 100;
            const he = showEstimated ? (b.estimated / max) * 100 : 0;
            const isJan = b.key.endsWith('-01') && i > 0;
            return (
              <button
                key={b.key}
                ref={(el) => {
                  buttonRefs.current[i] = el;
                }}
                type="button"
                tabIndex={i === Math.min(focusIdx, n - 1) ? 0 : -1}
                aria-pressed={selected}
                aria-label={`${formatMonthLong(b.key)}: ${plural(total(b), 'race')}`}
                onClick={(e) => {
                  if (e.detail === 0) commit(i, i); // keyboard activation; pointer handled above
                }}
                onKeyDown={(e) => onKeyDown(e, i)}
                onFocus={() => setFocusIdx(i)}
                className={cn(
                  'group/bar relative flex h-full flex-1 flex-col justify-end px-[2px] pt-1 outline-offset-0',
                  selected && 'bg-accent/45 dark:bg-accent/25',
                  selected && i === selFrom && 'rounded-l-lg',
                  selected && i === selTo && 'rounded-r-lg',
                  isJan && 'border-l border-dashed border-line-strong',
                )}
              >
                {he > 0 && (
                  <span
                    className={cn(
                      'block w-full rounded-t-[3px] transition-[height,opacity] duration-300',
                      dim ? 'opacity-30' : 'opacity-70 group-hover/bar:opacity-100',
                    )}
                    style={{
                      height: `${Math.max(he, 4)}%`,
                      background: 'repeating-linear-gradient(135deg, var(--tm-muted) 0 2px, transparent 2px 4px)',
                      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--tm-muted) 60%, transparent)',
                    }}
                  />
                )}
                <span
                  className={cn(
                    'block w-full transition-[height,background-color] duration-300',
                    he > 0 ? '' : 'rounded-t-[3px]',
                    b.count === 0 && he === 0 ? 'h-[2px] bg-line-strong' : '',
                    selected ? 'bg-ink' : dim ? 'bg-fg/15' : 'bg-fg/55 group-hover/bar:bg-fg',
                  )}
                  style={b.count > 0 ? { height: `${Math.max(h, 4)}%` } : undefined}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Month initials, with the year under the first month and every January. */}
      <div className="mt-1 flex text-[10px] leading-3 text-faint" aria-hidden="true">
        {buckets.map((b, i) => {
          const yearStart = i === 0 || b.key.endsWith('-01');
          return (
            <span key={b.key} className="tabular flex flex-1 flex-col items-center">
              <span className={cn(yearStart && 'font-semibold text-muted')}>
                {yearStart || i % showEvery === 0 ? monthAbbrev(b.key).slice(0, n > 14 ? 1 : 3) : ''}
              </span>
              <span className="h-3 font-bold text-muted">{yearStart ? `’${b.key.slice(2, 4)}` : ''}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
