import { useEffect, useState } from 'react';
import { localToday, type ISODate } from '../lib/dates.ts';

/**
 * Today's local date, kept current: phones keep a tab (or restore it from the back/forward
 * cache) for days, and countdowns, the next edition and the date filters all depend on it.
 * Rechecked when the page becomes visible again and at local midnight.
 */
export function useToday(): ISODate {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    let timer = 0;
    const check = () => setToday((t) => (localToday() === t ? t : localToday()));
    const schedule = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(() => {
        check();
        schedule();
      }, midnight.getTime() - now.getTime());
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      check();
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  return today;
}
