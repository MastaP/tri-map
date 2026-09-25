import { flagEmoji } from '../data/regions.ts';
import { cn } from '../lib/cn.ts';

/**
 * SVG flags (flag-icons, MIT) so flags render everywhere: Windows has no flag emoji and
 * shows letter pairs instead. Files are emitted as separate assets and lazy-loaded, so
 * only the ones scrolled into view are downloaded; the emoji is the fallback for
 * anything missing. Flags whose SVG is heavy (coats of arms: Serbia is 50 KB gzipped for
 * a 16 × 12 icon) use a small pre-rendered PNG from src/assets/flags instead.
 */
const FLAGS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});
const LIGHT_FLAGS = import.meta.glob<string>('/src/assets/flags/*.png', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

function flagUrl(code: string): string | undefined {
  const c = code.toLowerCase();
  return LIGHT_FLAGS[`/src/assets/flags/${c}.png`] ?? FLAGS[`/node_modules/flag-icons/flags/4x3/${c}.svg`];
}

export function Flag({ code, className }: { code: string; className?: string }) {
  const url = flagUrl(code);
  if (!url) return <span aria-hidden="true">{flagEmoji(code)}</span>;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={16}
      height={12}
      loading="lazy"
      decoding="async"
      className={cn(
        'inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]',
        className,
      )}
    />
  );
}
