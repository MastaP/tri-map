import { Search, X } from 'lucide-react';
import type { RefObject } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  placeholder?: string;
}

export function SearchBox({
  value,
  onChange,
  inputRef,
  className,
  placeholder = 'Search race, city or country',
}: Props) {
  return (
    <div className={`group relative ${className ?? ''}`}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-faint transition-colors group-focus-within:text-fg"
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label="Search races by name, city or country"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-line bg-surface-2 pr-11 pl-10 text-[15px] text-fg shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition-[border-color,background-color,box-shadow] outline-none placeholder:text-faint hover:border-line-strong focus:border-fg focus:bg-surface focus:ring-4 focus:ring-accent/40 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef?.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
        >
          <X className="size-4" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 font-sans text-[11px] leading-5 text-faint lg:block"
        >
          /
        </kbd>
      )}
    </div>
  );
}
