import { describe, expect, it } from 'vitest';
import { createShortlistStore, SHORTLIST_KEY, type KeyValueStorage } from '../../src/lib/shortlistStore.ts';

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, read: (k) => data.get(k) ?? null, write: (k, v) => void data.set(k, v) };
}

describe('shortlist store', () => {
  it('toggles stars, persists them and notifies subscribers', () => {
    const storage = memory();
    const store = createShortlistStore(storage);
    let calls = 0;
    store.subscribe(() => calls++);
    store.toggle('a');
    store.toggle('b');
    store.toggle('a');
    expect([...store.getSnapshot()]).toEqual(['b']);
    expect(JSON.parse(storage.data.get(SHORTLIST_KEY)!)).toEqual(['b']);
    expect(calls).toBe(3);
  });

  it('keeps a stable snapshot between changes', () => {
    const store = createShortlistStore(memory());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('keeps accumulating in memory when storage is unavailable', () => {
    const store = createShortlistStore({
      read: () => null, // what readStorage returns when localStorage throws
      write: () => {},
    });
    store.toggle('a');
    store.toggle('b');
    expect([...store.getSnapshot()].sort()).toEqual(['a', 'b']);
  });

  it('ignores corrupt stored values and picks up changes from other tabs', () => {
    const storage = memory();
    storage.data.set(SHORTLIST_KEY, '{"not":"an array"}');
    const store = createShortlistStore(storage);
    expect([...store.getSnapshot()]).toEqual([]);
    storage.data.set(SHORTLIST_KEY, '["x", 3, "y"]');
    store.reload();
    expect([...store.getSnapshot()]).toEqual(['x', 'y']);
  });

  it('does not overwrite a star another tab stored before its storage event arrived', () => {
    const storage = memory();
    const store = createShortlistStore(storage);
    store.toggle('a'); // this tab: ["a"]
    // Another tab writes directly; this tab has not received the storage event yet.
    storage.data.set(SHORTLIST_KEY, JSON.stringify(['a', 'b']));
    store.toggle('c');
    expect(JSON.parse(storage.data.get(SHORTLIST_KEY)!)).toEqual(['a', 'b', 'c']);
  });
});
