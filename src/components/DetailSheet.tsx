import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { sheetHeight, type SheetSnap } from './sheetSnap.ts';

interface Props {
  label: string;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onClose: () => void;
  /** Renders the sheet content; `handle` goes in its header row. */
  children: (handle: ReactNode) => ReactNode;
}

interface Drag {
  pointerId: number;
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  /** px per ms, positive when moving down. */
  velocity: number;
  moved: boolean;
  /** Current sheet height; kept here, not read from state, which may not have rendered yet. */
  h: number;
}

/**
 * Mobile race detail as a bottom sheet with two snap points: a peek that keeps the map
 * pin in view, and nearly full height. Drag the handle up or down (or flick it) to
 * switch; drag it down from the peek to close. The handle is also a button that toggles
 * between the two heights, for keyboard and screen-reader users.
 */
export function DetailSheet({ label, snap, onSnapChange, onClose, children }: Props) {
  const [viewportH, setViewportH] = useState(() => window.innerHeight);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const peekH = sheetHeight('peek', viewportH);
  const fullH = sheetHeight('full', viewportH);
  const height = dragH ?? (snap === 'full' ? fullH : peekH);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startH: height,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
      h: height,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 5) return;
    d.moved = true;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = 0.7 * ((e.clientY - d.lastY) / dt) + 0.3 * d.velocity;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.h = Math.min(fullH, Math.max(64, d.startH - dy));
    setDragH(d.h);
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.pointerId !== e.pointerId || !d.moved) return;
    suppressClick.current = true;
    const h = d.h;
    setDragH(null);
    if (d.velocity > 0.5) {
      // Flick down: full → peek, peek → closed.
      if (snap === 'full' && h > peekH * 0.8) onSnapChange('peek');
      else onClose();
    } else if (d.velocity < -0.5) {
      onSnapChange('full');
    } else if (h < peekH * 0.6) {
      onClose();
    } else {
      onSnapChange(Math.abs(h - fullH) < Math.abs(h - peekH) ? 'full' : 'peek');
    }
  };

  const handle = (
    <button
      type="button"
      aria-expanded={snap === 'full'}
      aria-label={snap === 'full' ? 'Show more of the map' : 'Expand race details'}
      title="Drag to resize"
      className="flex min-w-0 flex-1 cursor-grab touch-none items-center justify-center self-stretch outline-offset-[-4px] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setDragH(null);
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onSnapChange(snap === 'full' ? 'peek' : 'full');
      }}
      data-testid="sheet-handle"
    >
      <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={label}
      data-snap={snap}
      className={cn(
        'animate-sheet-in fixed inset-x-0 bottom-0 z-40 overflow-hidden rounded-t-3xl border-t border-line shadow-float',
        dragH === null && 'transition-[height] duration-300 ease-[var(--ease-out-soft)]',
      )}
      style={{ height }}
      data-testid="detail-sheet"
    >
      {children(handle)}
    </div>
  );
}
