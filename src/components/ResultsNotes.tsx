import { CalendarClock, Info, LocateFixed, MapPinned, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GeoStatus } from '../hooks/useGeolocation.ts';
import { cn } from '../lib/cn.ts';
import type { Origin } from '../lib/nearest.ts';
import { estimatedHiddenText } from '../lib/raceText.ts';
import { TOUCH_INLINE } from '../lib/touch.ts';

interface Props {
  /** Present while the "Nearest" sort is active. */
  nearest: { origin: Origin | null; geo: GeoStatus; mapAvailable: boolean } | null;
  /** Races an active course filter hides only because their course profile is unknown. */
  missingCourse: number;
  onUseLocation: () => void;
  onShowMissingCourse: () => void;
  onClearCourse: () => void;
  /** Starred races the other filters hide while "Shortlist" is on. */
  starredHidden: number;
  onShowAllStarred: () => void;
  /** T100 (100 km) races that would match if "Half" also included them. */
  t100Alongside: number;
  onIncludeT100: () => void;
  /** Races that would match with estimated dates shown (their date is not announced yet). */
  estimatedHidden: number;
  /** A date range or a year narrows the search ("usually held in this period"). */
  inPeriod: boolean;
  onShowEstimated: () => void;
}

const linkBtn = cn(
  'shrink-0 rounded font-semibold text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg',
  TOUCH_INLINE,
);

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-snug text-muted">
      <span className="mt-px shrink-0 text-faint" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function nearestText(origin: Origin | null, geo: GeoStatus, mapAvailable: boolean): string {
  if (origin?.source === 'location') return 'Distances from your location.';
  if (geo === 'pending')
    return mapAvailable ? 'Finding your location… Distances from the map centre for now.' : 'Finding your location…';
  if (!origin) {
    if (geo === 'denied') return 'Location not shared, and there is no map to measure from.';
    return mapAvailable ? 'Distances appear once the map has loaded.' : 'Share your location to sort by distance.';
  }
  if (geo === 'denied') return 'Location not shared, so distances are from the centre of the map (marked +).';
  if (geo === 'unavailable') return 'Location unavailable, so distances are from the centre of the map (marked +).';
  return 'Distances from the centre of the map (marked +). Pan the map to measure from elsewhere.';
}

/** Small print under the results toolbar: what a filter hid, and where "Nearest" measures from. */
export function ResultsNotes({
  nearest,
  missingCourse,
  onUseLocation,
  onShowMissingCourse,
  onClearCourse,
  starredHidden,
  onShowAllStarred,
  t100Alongside,
  onIncludeT100,
  estimatedHidden,
  inPeriod,
  onShowEstimated,
}: Props) {
  if (!nearest && missingCourse === 0 && starredHidden === 0 && t100Alongside === 0 && estimatedHidden === 0) {
    return null;
  }
  const canAsk = nearest && nearest.origin?.source !== 'location' && nearest.geo !== 'pending';
  return (
    <div className="space-y-1.5 border-b border-line bg-surface-2/60 px-4 py-2" role="status">
      {nearest && (
        <Note
          icon={
            nearest.origin?.source === 'location' ? (
              <LocateFixed className="size-3.5" />
            ) : (
              <MapPinned className="size-3.5" />
            )
          }
        >
          {nearestText(nearest.origin, nearest.geo, nearest.mapAvailable)}{' '}
          {canAsk && (
            <button type="button" onClick={onUseLocation} className={linkBtn}>
              {nearest.geo === 'idle' ? 'Use my location' : 'Try my location again'}
            </button>
          )}
        </Note>
      )}
      {starredHidden > 0 && (
        <Note icon={<Star className="size-3.5" />}>
          <span data-testid="starred-hidden-note">
            {starredHidden} starred {starredHidden === 1 ? 'race is' : 'races are'} hidden by your other filters.
          </span>{' '}
          <button type="button" onClick={onShowAllStarred} className={linkBtn}>
            Show all starred
          </button>
        </Note>
      )}
      {missingCourse > 0 && (
        <Note icon={<Info className="size-3.5" />}>
          <span data-testid="missing-course-note">
            {missingCourse} {missingCourse === 1 ? 'race' : 'races'} hidden: no course profile in our data yet.
          </span>{' '}
          <button type="button" onClick={onShowMissingCourse} className={linkBtn}>
            Show {missingCourse === 1 ? 'it' : 'them'}
          </button>{' '}
          ·{' '}
          <button type="button" onClick={onClearCourse} className={linkBtn}>
            Clear course filter
          </button>
        </Note>
      )}
      {estimatedHidden > 0 && (
        <Note icon={<CalendarClock className="size-3.5" />}>
          <span data-testid="estimated-hidden-note">{estimatedHiddenText(estimatedHidden, inPeriod)}</span>{' '}
          <button type="button" onClick={onShowEstimated} className={linkBtn}>
            Show estimated dates
          </button>
        </Note>
      )}
      {t100Alongside > 0 && (
        <Note icon={<Info className="size-3.5" />}>
          <span data-testid="t100-note">
            Also {t100Alongside} T100 {t100Alongside === 1 ? 'race' : 'races'}: a similar middle distance (2 / 80 / 18
            km), including former Challenge halves.
          </span>{' '}
          <button type="button" onClick={onIncludeT100} className={linkBtn}>
            Include T100
          </button>
        </Note>
      )}
    </div>
  );
}
