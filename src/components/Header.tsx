import { REPO_URL } from '../config.ts';
import type { ThemePref } from '../hooks/useTheme.ts';
import { GitHubIcon, LogoMark } from './Icons.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

interface Props {
  freshness: string | null;
  raceCount: number;
  themePref: ThemePref;
  onThemeChange: (p: ThemePref) => void;
  compact?: boolean;
}

export function Header({ freshness, raceCount, themePref, onThemeChange, compact }: Props) {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:px-5">
      <a
        href="./"
        className="group flex items-center gap-2.5 rounded-lg pointer-coarse:min-h-11"
        aria-label="TriMap home"
      >
        <LogoMark className="size-8 transition-transform duration-300 group-hover:-rotate-6" />
        <span className="font-display text-[26px] leading-none font-bold tracking-tight uppercase italic">
          Tri<span className="text-accent-text">Map</span>
        </span>
      </a>
      {!compact && (
        <p className="hidden truncate border-l border-line pl-3 text-sm text-muted xl:block">
          Find a full, half or T100 triathlon you can enter, worldwide
        </p>
      )}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {!compact && freshness && (
          <p
            className="hidden items-center gap-2 text-xs text-muted md:flex"
            title={`${raceCount} races in the database`}
          >
            <span className="size-2 rounded-full bg-accent ring-1 ring-black/10" aria-hidden="true" />
            <span>
              <span className="tabular font-semibold text-fg">{raceCount}</span> races · Race data checked {freshness}
            </span>
          </p>
        )}
        {REPO_URL && (
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg max-sm:hidden pointer-coarse:size-11"
            aria-label="TriMap on GitHub"
            title="Source code on GitHub"
          >
            <GitHubIcon className="size-[18px]" />
          </a>
        )}
        <ThemeToggle pref={themePref} onChange={onThemeChange} compact={compact} />
      </div>
    </header>
  );
}
