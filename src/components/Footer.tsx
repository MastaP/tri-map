import { correctionUrl, REPO_URL } from '../config.ts';
import { cn } from '../lib/cn.ts';
import { TOUCH_INLINE } from '../lib/touch.ts';

export function Footer({ freshness }: { freshness: string | null }) {
  const correction = correctionUrl();
  return (
    <footer className="space-y-2 px-4 py-6 text-[12px] leading-relaxed text-faint">
      <p>
        Not affiliated with IRONMAN, Challenge Family or PTO/T100. Dates can change; always confirm on the official
        website.
      </p>
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
