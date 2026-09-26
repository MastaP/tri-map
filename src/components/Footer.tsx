import { correctionUrl, REPO_URL } from '../config.ts';
import {
  checkedDay,
  REGISTRATION_MAX_AGE_DAYS,
  REGISTRATION_SOURCES,
  type RegistrationSourceSummary,
} from '../data/registration.ts';
import { cn } from '../lib/cn.ts';
import { formatDayMonth } from '../lib/dates.ts';
import { TOUCH_INLINE } from '../lib/touch.ts';

/** "IRONMAN and IRONMAN 70.3 from ironman.com, checked 26 Sep 2026" */
function sourceText(s: RegistrationSourceSummary): string {
  const info = REGISTRATION_SOURCES[s.id];
  const when = formatDayMonth(checkedDay(s.checkedAt), { year: true });
  return `${info.covers} from ${info.from}, checked ${when}${s.fresh ? '' : ' (too old to show)'}`;
}

export function Footer({
  freshness,
  registration = [],
}: {
  freshness: string | null;
  /** The bundled registration status sources and when each was checked. */
  registration?: RegistrationSourceSummary[];
}) {
  const correction = correctionUrl();
  return (
    <footer className="space-y-2 px-4 py-6 text-[12px] leading-relaxed text-faint">
      <p>
        Not affiliated with IRONMAN, Challenge Family or PTO/T100. Dates can change; always confirm on the official
        website.
      </p>
      {registration.length > 0 && (
        <p data-testid="registration-sources">
          Registration status (sold out, opening soon…): {registration.map(sourceText).join('; ')}. Races from other
          organisers show no status, and a status older than {REGISTRATION_MAX_AGE_DAYS} days is not shown.
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {freshness && <span>Race data checked {freshness}</span>}
        {correction && (
          <a
            href={correction}
            target="_blank"
            rel="noreferrer"
            className={cn('font-medium text-muted underline underline-offset-2 hover:text-fg', TOUCH_INLINE)}
          >
            Report a correction
          </a>
        )}
        {REPO_URL && (
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={cn('font-medium text-muted underline underline-offset-2 hover:text-fg', TOUCH_INLINE)}
          >
            Source on GitHub
          </a>
        )}
        <span>
          Map ©{' '}
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer"
            className={cn('underline underline-offset-2 hover:text-fg', TOUCH_INLINE)}
          >
            CARTO
          </a>{' '}
          ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className={cn('underline underline-offset-2 hover:text-fg', TOUCH_INLINE)}
          >
            OpenStreetMap
          </a>
        </span>
      </p>
    </footer>
  );
}
