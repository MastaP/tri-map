import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
}

/** Modal bottom sheet built on <dialog> (focus trap, Esc and backdrop for free). */
export function Sheet({ open, onClose, title, children, footer, headerExtra }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="animate-sheet-in fixed inset-x-0 top-auto bottom-0 m-0 h-[88dvh] max-h-none w-full max-w-none overflow-hidden rounded-t-3xl border-t border-line bg-surface p-0 text-fg shadow-float backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
            <h2 id={titleId} className="font-display text-xl font-bold tracking-wide uppercase">
              {title}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              {headerExtra}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{children}</div>
          {footer && (
            <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
