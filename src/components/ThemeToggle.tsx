import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePref } from '../hooks/useTheme.ts';
import { cn } from '../lib/cn.ts';

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System theme', Icon: Monitor },
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
];

export function ThemeToggle({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
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
            'grid size-7 place-items-center rounded-full transition-colors',
            pref === value ? 'bg-surface text-fg shadow-card' : 'text-faint hover:text-fg',
          )}
        >
          <Icon className="size-3.5" strokeWidth={2.2} />
        </button>
      ))}
    </div>
  );
}
