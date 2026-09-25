import { flagEmoji } from '../data/regions.ts';
import { cn } from '../lib/cn.ts';

/**
 * SVG flags (flag-icons, MIT) so flags render everywhere: Windows has no flag emoji and
 * shows letter pairs instead. Files are emitted as separate assets and only the ones on
 * screen are downloaded; the emoji is the fallback for anything missing.
 */
const FLAGS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

function flagUrl(code: string): string | undefined {
  return FLAGS[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`];
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
      decoding="async"
      className={cn(
        'inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]',
        className,
      )}
    />
  );
}
