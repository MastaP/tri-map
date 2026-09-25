import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastMessage {
  text: string;
  key: number;
}

export function useToast() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMessage({ text, key: Date.now() });
    timer.current = window.setTimeout(() => setMessage(null), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { message, show };
}
