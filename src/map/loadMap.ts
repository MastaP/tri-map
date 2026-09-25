/**
 * Loads the map chunk. After a new deploy, an old page can ask for a chunk file that no
 * longer exists: that failure reloads the page once per session to pick up the new build.
 */
const RELOAD_KEY = 'trimap.mapChunkReload';

export function importMapView() {
  return import('./MapView.tsx').then((m) => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* storage blocked */
    }
    return m;
  });
}

export function importMapViewOrReload() {
  return importMapView().catch((err: unknown) => {
    let reload = false;
    try {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        reload = true;
      }
    } catch {
      /* storage blocked: never reload, or it could loop */
    }
    if (reload) {
      window.location.reload();
      return new Promise<never>(() => {});
    }
    throw err;
  });
}
