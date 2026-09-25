/** Run `cb` when the browser is idle (or after `timeout` ms); returns a cancel function. */
export function whenIdle(cb: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(cb, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const t = window.setTimeout(cb, Math.min(timeout, 200));
  return () => window.clearTimeout(t);
}
