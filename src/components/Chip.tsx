import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

interface ChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  icon?: ReactNode;
  label?: string;
  title?: string;
  className?: string;
}

/** Toggle chip (regions, date presets). Pressed = ink, like the other filter tiles. */
export function Chip({ pressed, onClick, children, count, icon, label, title, className }: ChipProps) {
  const empty = count === 0 && !pressed;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border pr-3 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] pointer-coarse:h-11 pointer-coarse:text-[13.5px]',
        icon ? 'pl-1' : 'pl-3',
        pressed
          ? 'border-ink bg-ink text-on-ink'
          : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2',
        empty && 'text-faint',
        className,
      )}
    >
      {icon}
      <span>{children}</span>
      {count !== undefined && (
        <span className={cn('tabular text-[11px] font-semibold', pressed ? 'text-on-ink/65' : 'text-faint')}>
          {count}
        </span>
      )}
    </button>
  );
}

interface ToggleChipProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

/**
 * On/off pill exposed as a switch; shows a check when on. Every switch is off by default,
 * so the lime "on" state always means "changed from the default" (all of them narrow the
 * results except "Estimated dates", which adds races whose date is not announced yet).
 */
export function ToggleChip({ checked, onChange, children, icon, title, disabled }: ToggleChipProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors pointer-coarse:h-11 pointer-coarse:text-[13.5px]',
        checked
          ? 'border-ink/80 bg-accent-soft text-fg dark:border-accent/50'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-5 place-items-center rounded-full transition-colors',
          checked ? 'bg-ink text-accent dark:bg-accent dark:text-accent-ink' : 'bg-surface-3 text-faint',
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3.5} /> : icon}
      </span>
      {children}
    </button>
  );
}
