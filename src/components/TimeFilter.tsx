import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../lib/cn.ts';
import { formatMonthLong, monthAbbrev, type ISODate } from '../lib/dates.ts';
import {
  describeTime,
  resolveTimeRange,
  TIME_PRESET_LABELS,
  TIME_PRESETS,
  type MonthBucket,
  type TimeFilter as TimeFilterValue,
} from '../lib/filters.ts';

interface Props {
  titleId: string;
  buckets: MonthBucket[];
  /** Races matching every other filter, including ones without any date. */
  anyTimeCount: number;
  time: TimeFilterValue;
  today: ISODate;
  showEstimated: boolean;
  onChange: (t: TimeFilterValue) => void;
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;

const PRESET_SHORT: Record<(typeof TIME_PRESETS)[number], (today: ISODate) => string> = {
  '3m': () => '3 months',
  '6m': () => '6 months',
  year: (t) => `Rest of ${t.slice(0, 4)}`,
  'next-year': (t) => String(Number(t.slice(0, 4)) + 1),
};

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

/**
 * Month histogram (bar height = races matching the other filters) with click / drag /
 * keyboard range selection, plus quick presets.
 */
export function TimeFilter({ titleId, buckets, anyTimeCount, time, today, showEstimated, onChange }: Props) {
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

  const inSelCount = hasSel ? buckets.slice(selFrom, selTo + 1).reduce((a, b) => a + total(b), 0) : 0;

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

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !n) return;
    const i = indexAt(e.clientX);
    setDrag({ anchor: i, current: i });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!n) return;
    const i = indexAt(e.clientX);
    if (e.pointerType === 'mouse') setHover(i);
    if (drag && drag.current !== i) setDrag({ ...drag, current: i });
  };
  const onPointerUp = () => {
    if (!drag) return;
    commit(drag.anchor, drag.current);
    setFocusIdx(drag.current);
    setDrag(null);
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

  const hoverBucket = hover !== null ? buckets[hover] : undefined;
  const summary = hoverBucket
    ? `${formatMonthLong(hoverBucket.key)} · ${plural(total(hoverBucket), 'race')}${
        showEstimated && hoverBucket.estimated ? ` (${hoverBucket.estimated} est.)` : ''
      }`
    : hasSel
      ? `${drag ? 'Select' : describeTime(time, today)} · ${plural(inSelCount, 'race')}`
      : `${describeTime(time, today)} · ${plural(anyTimeCount, 'race')}`;

  const showEvery = n > 18 ? 2 : 1;

  return (
    <div>
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
        <h3 id={titleId} className="font-display text-[12px] font-bold tracking-[0.14em] text-muted uppercase">
          When
        </h3>
        <p className="tabular truncate text-[12px] text-muted" aria-live="polite">
          {summary}
        </p>
      </div>

      <div
        ref={barsRef}
        role="group"
        aria-label="Races per month. Click a month, or drag across months, to filter by date. Shift and arrow keys extend the range."
        className="relative flex h-14 touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
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

      <div className="mt-1 flex text-[10px] leading-3 text-faint" aria-hidden="true">
        {buckets.map((b, i) => {
          const yearStart = i === 0 || b.key.endsWith('-01');
          return (
            <span key={b.key} className={cn('tabular flex-1 text-center', yearStart && 'font-bold text-muted')}>
              {yearStart
                ? `’${b.key.slice(2, 4)}`
                : i % showEvery === 0
                  ? monthAbbrev(b.key).slice(0, n > 14 ? 1 : 3)
                  : ''}
            </span>
          );
        })}
      </div>

      <div role="group" aria-label="Date presets" className="mt-2.5 flex rounded-xl bg-surface-2 p-0.5">
        {[...TIME_PRESETS, 'any' as const].map((p) => {
          const pressed = p === 'any' ? time.kind === 'any' : time.kind === 'preset' && time.preset === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={pressed}
              aria-label={p === 'any' ? 'Any time' : TIME_PRESET_LABELS[p]}
              title={p === 'any' ? 'Any time' : TIME_PRESET_LABELS[p]}
              onClick={() => onChange(p === 'any' || pressed ? { kind: 'any' } : { kind: 'preset', preset: p })}
              className={cn(
                'h-7 flex-auto rounded-[10px] px-2 text-[12px] font-semibold whitespace-nowrap transition-colors',
                pressed ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
              )}
            >
              {p === 'any' ? 'Any time' : PRESET_SHORT[p](today)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
