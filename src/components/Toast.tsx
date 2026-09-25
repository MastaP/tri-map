import { Check } from 'lucide-react';

import type { ToastMessage } from '../hooks/useToast.ts';

export function Toast({ message }: { message: ToastMessage | null }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-32 z-[60] flex justify-center px-4 lg:bottom-6"
    >
      {message && (
        <div
          key={message.key}
          className="animate-slide-up flex items-center gap-2.5 rounded-full bg-ink py-2 pr-4 pl-2 text-sm font-medium text-on-ink shadow-float"
        >
          <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-ink" aria-hidden="true">
            <Check className="size-3.5" strokeWidth={3.5} />
          </span>
          {message.text}
        </div>
      )}
    </div>
  );
}
