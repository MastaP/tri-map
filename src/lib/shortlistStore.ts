/**
 * Starred race ids. A tiny external store (for useSyncExternalStore) over an injectable
 * key/value storage, so it keeps working in memory when localStorage is unavailable.
 */
export const SHORTLIST_KEY = 'trimap.shortlist.v1';

export interface KeyValueStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export interface ShortlistStore {
  getSnapshot(): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
  toggle(id: string): void;
  /** Re-read from storage (e.g. after another tab changed it). */
  reload(): void;
}

export function createShortlistStore(storage: KeyValueStorage): ShortlistStore {
  let snapshot: ReadonlySet<string> | null = null;
  const listeners = new Set<() => void>();

  const parse = (raw: string | null): ReadonlySet<string> => {
    try {
      const parsed: unknown = JSON.parse(raw ?? '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const read = () => parse(storage.read(SHORTLIST_KEY));
  const emit = () => listeners.forEach((l) => l());
  const getSnapshot = () => (snapshot ??= read());

  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle(id) {
      // Base the change on what is stored right now, so a star just added in another tab
      // (whose storage event may not have arrived yet) is not overwritten. When storage
      // returns nothing (unavailable, e.g. private mode), fall back to the in-memory set
      // so stars still accumulate for this session.
      const stored = storage.read(SHORTLIST_KEY);
      const next = new Set(stored !== null ? parse(stored) : getSnapshot());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      snapshot = next;
      storage.write(SHORTLIST_KEY, JSON.stringify([...next]));
      emit();
    },
    reload() {
      snapshot = read();
      emit();
    },
  };
}
