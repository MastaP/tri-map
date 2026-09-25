import { MapPinOff } from 'lucide-react';

interface Props {
  /** "webgl": the browser cannot draw the map; "error": it failed to load or start. */
  reason: 'webgl' | 'error';
  onRetry?: () => void;
  /** Mobile: go back to the list. */
  onShowList?: () => void;
}

/** Shown in place of the map when it cannot load; the list and filters keep working. */
export function MapUnavailable({ reason, onRetry, onShowList }: Props) {
  return (
    <div className="grid size-full place-items-center bg-[var(--tm-map-bg)] p-6" data-testid="map-unavailable">
      <div className="max-w-xs rounded-2xl border border-line bg-surface p-5 text-center shadow-card">
        <span
          className="mx-auto grid size-11 place-items-center rounded-full bg-surface-2 text-muted"
          aria-hidden="true"
        >
          <MapPinOff className="size-5" />
        </span>
        <p className="mt-3 font-display text-lg font-bold tracking-wide uppercase">Map unavailable</p>
        <p className="mt-1 text-sm text-muted">
          {reason === 'webgl'
            ? 'This browser cannot draw the map (WebGL 2 is turned off or not supported).'
            : 'The map could not load.'}{' '}
          The race list and filters still work.
        </p>
        {(onRetry || onShowList) && (
          <div className="mt-4 flex justify-center gap-2">
            {onShowList && (
              <button
                type="button"
                onClick={onShowList}
                className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-on-ink"
              >
                Show the list
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="h-10 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
