import { useCallback, useEffect, useRef, useState } from 'react';
import type { LngLat } from '../lib/geo.ts';

export type GeoStatus = 'idle' | 'pending' | 'granted' | 'denied' | 'unavailable';

export interface GeoState {
  status: GeoStatus;
  position: LngLat | null;
}

/**
 * The browser's own `timeout` only starts once permission is granted, and some browsers
 * never call back when the prompt is dismissed or ignored. After this long the request
 * counts as unavailable (a late answer is still applied), so "try again" is offered.
 */
export const GEO_WATCHDOG_MS = 30_000;

/**
 * The viewer's approximate position, requested only when `request()` is called (the
 * user picked "Nearest" or pressed "Use my location"), never on page load.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle', position: null });
  const pending = useRef(false);
  const watchdog = useRef<number | undefined>(undefined);
  /** Id of the latest request: answers to older ones must not touch its timer or flag. */
  const latest = useRef(0);
  /** Id of the request whose position is shown: an older, late answer must not replace it. */
  const shownFrom = useRef(0);

  useEffect(() => () => window.clearTimeout(watchdog.current), []);

  const request = useCallback(() => {
    if (pending.current) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unavailable' }));
      return;
    }
    const id = ++latest.current;
    pending.current = true;
    setState((s) => ({ ...s, status: 'pending' }));
    const finish = () => {
      if (id !== latest.current) return;
      window.clearTimeout(watchdog.current);
      pending.current = false;
    };
    watchdog.current = window.setTimeout(() => {
      if (id !== latest.current) return;
      pending.current = false;
      setState((s) => (s.status === 'pending' ? { ...s, status: 'unavailable' } : s));
    }, GEO_WATCHDOG_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish();
        // A position is useful whenever it arrives, even from an older request, unless a
        // newer request already answered.
        if (id < shownFrom.current) return;
        shownFrom.current = id;
        setState({ status: 'granted', position: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      },
      (err) => {
        if (id !== latest.current) return; // a newer request is in charge
        finish();
        setState((s) =>
          // Never drop a position we already have because a later retry failed.
          s.position
            ? { ...s, status: 'granted' }
            : { status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable', position: null },
        );
      },
      // City-level accuracy is plenty for "which races are near me".
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 30 * 60_000 },
    );
  }, []);

  return { ...state, request };
}
