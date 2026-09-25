export type SheetSnap = 'peek' | 'full';

/** Share of the viewport height the mobile race sheet takes at each snap point. */
const SNAP_SHARE: Record<SheetSnap, number> = { peek: 0.48, full: 0.92 };

export function sheetHeight(snap: SheetSnap, viewportH = window.innerHeight): number {
  return Math.round(viewportH * SNAP_SHARE[snap]);
}
