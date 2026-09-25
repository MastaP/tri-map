import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePref } from '../hooks/useTheme.ts';
import { cn } from '../lib/cn.ts';

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System theme', Icon: Monitor },
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
];

interface Props {
  pref: ThemePref;
  onChange: (p: ThemePref) => void;
  /** One button that cycles system → light → dark (phones, where header space is short). */
  compact?: boolean;
}

export function ThemeToggle({ pref, onChange, compact }: Props) {
  if (compact) {
    const i = OPTIONS.findIndex((o) => o.value === pref);
    const current = OPTIONS[i]!;
    const next = OPTIONS[(i + 1) % OPTIONS.length]!;
    return (
      <button
        type="button"
        onClick={() => onChange(next.value)}
        aria-label={`${current.label}. Switch to ${next.label.toLowerCase()}`}
        title={`${current.label} (tap for ${next.label.toLowerCase()})`}
        className="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg pointer-coarse:size-11"
      >
        <current.Icon className="size-[18px]" strokeWidth={2.2} />
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center rounded-full border border-line bg-surface-2 p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={pref === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
          className={cn(
            'grid size-7 place-items-center rounded-full transition-colors pointer-coarse:size-11',
            pref === value
              ? 'bg-surface text-fg shadow-card ring-1 ring-line-strong ring-inset dark:bg-surface-3 dark:ring-fg/45'
              : 'text-faint hover:text-fg',
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.2} />
        </button>
      ))}
    </div>
  );
}
