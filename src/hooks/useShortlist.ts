import { useCallback, useSyncExternalStore } from 'react';
import { createShortlistStore, SHORTLIST_KEY } from '../lib/shortlistStore.ts';
import { readStorage, writeStorage } from '../lib/storage.ts';

const store = createShortlistStore({ read: readStorage, write: writeStorage });

function subscribe(listener: () => void) {
  const unsubscribe = store.subscribe(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SHORTLIST_KEY || e.key === null) store.reload();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: ReadonlySet<string> = new Set();

/** Starred race ids, persisted in localStorage and synced across tabs. */
export function useShortlist() {
  const shortlist = useSyncExternalStore(subscribe, store.getSnapshot, () => EMPTY);
  const toggle = useCallback((id: string) => store.toggle(id), []);
  return { shortlist, toggle };
}
