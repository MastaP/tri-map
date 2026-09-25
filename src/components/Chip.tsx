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
  className?: string;
}

/** Toggle chip used by the region filter. */
export function Chip({ pressed, onClick, children, count, icon, label, className }: ChipProps) {
  const empty = count === 0 && !pressed;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
        icon ? 'pl-1' : 'pl-2.5',
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
}

/** On/off pill exposed as a switch; shows a check when on. */
export function ToggleChip({ checked, onChange, children, icon, title }: ToggleChipProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-[12.5px] font-medium whitespace-nowrap transition-colors',
        checked
          ? 'border-ink/80 bg-accent-soft text-fg dark:border-accent/50'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg',
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
