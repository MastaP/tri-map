/**
 * The world map. Lazy-loaded (React.lazy) so the results list renders before maplibre
 * arrives. Races are a clustered GeoJSON source; clusters and single races are drawn as
 * HTML markers (brand glyphs / SVG donuts) synced from the source on every render.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MLMap,
  Marker,
  Popup,
  setWorkerUrl,
  type GeoJSONFeature,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection, Point } from 'geojson';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrandId } from '../data/brands.ts';
import type { Race } from '../data/types.ts';
import type { Theme } from '../hooks/useTheme.ts';
import { pointsBounds, type Bounds } from '../lib/geo.ts';
import { Legend } from './Legend.tsx';
import {
  clusterElement,
  clusterPopupContent,
  hoverRingElement,
  raceMarkerElement,
  selectionElement,
  updateSelectionElement,
  type ClusterProps,
} from './markers.ts';

setWorkerUrl(workerUrl);

const SOURCE = 'races';
const MAX_ZOOM = 14;
const TAG_ZOOM = 5;

const BASEMAPS: Record<Theme, string> = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

/** Used when the basemap cannot be fetched (offline): markers still work. */
function fallbackStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': theme === 'dark' ? '#10151f' : '#e9edf2' } },
    ],
  };
}

export interface MapViewProps {
  races: Race[];
  theme: Theme;
  selectedRace: Race | null;
  hoveredId: string | null;
  brandFilter: BrandId[];
  brandCounts: Record<BrandId, number>;
  onToggleBrand: (b: BrandId) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onBoundsChange: (b: Bounds) => void;
  /** Changing this value fits the map to the current races (e.g. after a region change). */
  fitKey: string;
  /** Pixels hidden behind an overlay at the bottom (mobile sheets). */
  bottomInset?: number;
  compactLegend?: boolean;
}

function toFeatureCollection(races: Race[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: races.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: { id: r.id, brand: r.brand },
    })),
  };
}

const brandSum = (b: BrandId) => ['+', ['case', ['==', ['get', 'brand'], b], 1, 0]];

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export default function MapView(props: MapViewProps) {
  const { races, theme, selectedRace, hoveredId, fitKey, bottomInset = 0 } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const selectionRef = useRef<Marker | null>(null);
  const hoverRingRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const raceByIdRef = useRef(new Map<string, Race>());
  /** Ids currently in the GeoJSON source, to skip no-op setData calls. */
  const dataKey = useRef('');
  const latest = useLatest(props);
  const [styleReady, setStyleReady] = useState(false);
  const [legendOpen, setLegendOpen] = useState(!props.compactLegend);
  const legendOpenRef = useLatest(legendOpen);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const api = useRef<{ update: () => void; highlight: () => void; fit: (animate?: boolean) => void } | null>(null);

  useLayoutEffect(() => {
    raceByIdRef.current = new Map(races.map((r) => [r.id, r]));
  }, [races]);

  // ---- create the map once --------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current!;
    const initial = latest.current;
    const map = new MLMap({
      container,
      style: BASEMAPS[initial.theme],
      center: [12, 30],
      zoom: 1.3,
      minZoom: 0.6,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: true,
      fadeDuration: 120,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;

    if (initial.selectedRace) {
      map.jumpTo({ center: [initial.selectedRace.lng, initial.selectedRace.lat], zoom: 6 });
    } else {
      fit(false); // hoisted below
    }

    let styleLoadedOnce = false;
    let fallback = false;
    const applyFallback = () => {
      if (fallback || styleLoadedOnce) return;
      fallback = true;
      setBasemapFailed(true);
      map.setStyle(fallbackStyle(latest.current.theme), { diff: false });
    };
    const fallbackTimer = window.setTimeout(applyFallback, 12000);

    const addSource = () => {
      if (map.getSource(SOURCE)) return;
      dataKey.current = latest.current.races.map((r) => r.id).join('|');
      map.addSource(SOURCE, {
        type: 'geojson',
        data: toFeatureCollection(latest.current.races),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: MAX_ZOOM,
        clusterProperties: {
          ironman: brandSum('ironman'),
          challenge: brandSum('challenge'),
          t100: brandSum('t100'),
          independent: brandSum('independent'),
        },
      });
      // Invisible layer: makes the source load tiles so clusters can be queried.
      map.addLayer({
        id: `${SOURCE}-anchor`,
        type: 'circle',
        source: SOURCE,
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      });
    };

    map.on('style.load', () => {
      styleLoadedOnce = true;
      window.clearTimeout(fallbackTimer);
      addSource();
      setStyleReady(true);
      api.current?.update();
    });
    map.on('error', (e) => {
      if (!styleLoadedOnce) {
        console.warn('Basemap failed to load, using fallback style', e.error);
        applyFallback();
      }
    });

    let frame = 0;
    map.on('render', () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        api.current?.update();
      });
    });

    const syncZoomClass = () => container.classList.toggle('tm-show-tags', map.getZoom() >= TAG_ZOOM);
    map.on('zoom', syncZoomClass);
    syncZoomClass();

    const reportBounds = () => {
      const b = map.getBounds();
      latest.current.onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    map.on('moveend', reportBounds);
    map.once('load', reportBounds);

    function update() {
      if (!map.getSource(SOURCE) || !map.isSourceLoaded(SOURCE)) return;
      const markers = markersRef.current;
      const wanted = new Map<string, GeoJSONFeature>();
      for (const f of map.querySourceFeatures(SOURCE)) {
        const p = f.properties as Partial<ClusterProps> & { cluster?: boolean; id?: string };
        const key = p.cluster
          ? `c:${p.cluster_id}:${p.point_count}:${p.ironman}:${p.challenge}:${p.t100}:${p.independent}`
          : `r:${p.id}`;
        if (!wanted.has(key)) wanted.set(key, f);
      }
      for (const [key, m] of markers) {
        if (!wanted.has(key)) {
          m.remove();
          markers.delete(key);
        }
      }
      for (const [key, f] of wanted) {
        if (markers.has(key)) continue;
        const p = f.properties as ClusterProps & { cluster?: boolean; id?: string };
        if (p.cluster) {
          const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
          const el = clusterElement(p, () => void onClusterClick(p.cluster_id, [lng, lat]));
          markers.set(key, new Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
        } else {
          const race = raceByIdRef.current.get(p.id!);
          if (!race) continue;
          const el = raceMarkerElement(race, {
            onClick: (id) => latest.current.onSelect(id),
            onHover: (id) => latest.current.onHover(id),
          });
          markers.set(key, new Marker({ element: el, anchor: 'center' }).setLngLat([race.lng, race.lat]).addTo(map));
        }
      }
      highlight();
    }

    function highlight() {
      const { selectedRace: sel, hoveredId: hov } = latest.current;
      for (const [key, m] of markersRef.current) {
        if (!key.startsWith('r:')) continue;
        const id = key.slice(2);
        const el = m.getElement();
        el.classList.toggle('is-selected', id === sel?.id);
        el.classList.toggle('is-hovered', id === hov);
      }
    }

    async function onClusterClick(clusterId: number, lngLat: [number, number]) {
      const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
      if (!src) return;
      let expansion: number;
      let leaves: Awaited<ReturnType<GeoJSONSource['getClusterLeaves']>>;
      try {
        [expansion, leaves] = await Promise.all([
          src.getClusterExpansionZoom(clusterId),
          src.getClusterLeaves(clusterId, 200, 0),
        ]);
      } catch {
        return; // the cluster vanished (filters changed) while we waited
      }
      if (mapRef.current !== map || !leaves.length) return; // unmounted meanwhile
      const coords = leaves.map((l) => (l.geometry as Point).coordinates as [number, number]);
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      const spread = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
      if (spread < 0.002 || expansion > MAX_ZOOM) {
        const list = leaves
          .map((l) => raceByIdRef.current.get((l.properties as { id: string }).id))
          .filter((r): r is Race => !!r)
          .sort((a, b) => (a.nextEdition?.date ?? '9').localeCompare(b.nextEdition?.date ?? '9'));
        popupRef.current?.remove();
        popupRef.current = new Popup({ offset: 24, maxWidth: '320px', focusAfterOpen: true })
          .setLngLat(lngLat)
          .setDOMContent(
            clusterPopupContent(list, (id) => {
              popupRef.current?.remove();
              latest.current.onSelect(id);
            }),
          )
          .addTo(map);
        return;
      }
      map.easeTo({ center: lngLat, zoom: Math.min(expansion + 0.2, MAX_ZOOM) });
    }

    function fit(animate = true) {
      const b = pointsBounds(latest.current.races);
      if (!b) return;
      const bounds = new LngLatBounds([b[0], b[1]], [b[2], b[3]]);
      // Keep fitted races clear of the controls (right) and the open legend (bottom left);
      // a world-wide view would zoom out too far for that, and the legend sits on ocean.
      const legend = legendOpenRef.current && !latest.current.compactLegend && b[2] - b[0] < 180;
      map.fitBounds(bounds, {
        padding: { top: 64, left: legend ? 240 : 56, right: 72, bottom: 56 + (latest.current.bottomInset ?? 0) },
        maxZoom: 7,
        duration: animate ? 900 : 0,
      });
    }

    api.current = { update, highlight, fit };

    const markers = markersRef.current;
    return () => {
      window.clearTimeout(fallbackTimer);
      cancelAnimationFrame(frame);
      markers.forEach((m) => m.remove());
      markers.clear();
      selectionRef.current?.remove();
      selectionRef.current = null;
      hoverRingRef.current?.remove();
      hoverRingRef.current = null;
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      api.current = null;
    };
  }, [latest, legendOpenRef]);

  // ---- data, theme, highlights ------------------------------------------------------
  useEffect(() => {
    const src = mapRef.current?.getSource(SOURCE) as GeoJSONSource | undefined;
    const key = races.map((r) => r.id).join('|');
    if (!src || key === dataKey.current) return;
    dataKey.current = key;
    src.setData(toFeatureCollection(races));
    popupRef.current?.remove();
  }, [races]);

  const themeRef = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(basemapFailed ? fallbackStyle(theme) : BASEMAPS[theme], { diff: false });
  }, [theme, basemapFailed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedRace) {
      selectionRef.current ??= new Marker({ element: selectionElement(), anchor: 'center' });
      updateSelectionElement(selectionRef.current.getElement(), selectedRace);
      selectionRef.current.setLngLat([selectedRace.lng, selectedRace.lat]).addTo(map);
    } else {
      selectionRef.current?.remove();
    }
    api.current?.highlight();
  }, [selectedRace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const race = hoveredId ? raceByIdRef.current.get(hoveredId) : undefined;
    // A race with its own marker is highlighted by scaling that marker; the ring is for
    // races hidden inside a cluster.
    const hidden = race && !markersRef.current.has(`r:${race.id}`);
    if (race && hidden && race.id !== selectedRace?.id) {
      hoverRingRef.current ??= new Marker({ element: hoverRingElement(), anchor: 'center' });
      hoverRingRef.current.setLngLat([race.lng, race.lat]).addTo(map);
    } else {
      hoverRingRef.current?.remove();
    }
    api.current?.highlight();
  }, [hoveredId, selectedRace]);

  // ---- camera ---------------------------------------------------------------------
  const fitKeyRef = useRef(fitKey);
  useEffect(() => {
    if (fitKeyRef.current === fitKey) return;
    fitKeyRef.current = fitKey;
    api.current?.fit();
  }, [fitKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRace) return;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const visibleH = h - bottomInset;
    const pt = map.project([selectedRace.lng, selectedRace.lat]);
    const comfortablyVisible = pt.x > w * 0.12 && pt.x < w * 0.88 && pt.y > visibleH * 0.12 && pt.y < visibleH * 0.88;
    if (comfortablyVisible && map.getZoom() >= 4.5) return;
    map.flyTo({
      center: [selectedRace.lng, selectedRace.lat],
      zoom: Math.max(map.getZoom(), 6.5),
      padding: { top: 0, left: 0, right: 0, bottom: bottomInset },
      duration: 1300,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only when the selection changes
  }, [selectedRace?.id]);

  const btn =
    'grid size-9 place-items-center text-fg transition-colors hover:bg-surface-2 active:bg-surface-3 disabled:opacity-40';

  return (
    <div className="relative isolate size-full overflow-hidden bg-[var(--tm-map-bg)]">
      {/* maplibre forces position:relative on its container, so size it via a wrapper. */}
      <div className="absolute inset-0">
        <div
          ref={containerRef}
          className="size-full"
          role="region"
          aria-label="Map of races. Use the results list to browse races with the keyboard."
          data-testid="race-map"
        />
      </div>

      {!styleReady && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="animate-fade-in rounded-full bg-surface/90 px-4 py-2 text-sm text-muted shadow-card">
            Loading map…
          </p>
        </div>
      )}
      {basemapFailed && (
        <p className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-card">
          Basemap unavailable: showing races only
        </p>
      )}

      <div className="absolute top-3 right-3 z-10 flex flex-col overflow-hidden rounded-xl border border-line bg-surface/95 shadow-card backdrop-blur">
        <button
          type="button"
          className={btn}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus className="size-[18px]" />
        </button>
        <button
          type="button"
          className={`${btn} border-t border-line`}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus className="size-[18px]" />
        </button>
        <button
          type="button"
          className={`${btn} border-t border-line`}
          aria-label="Fit map to results"
          title="Fit map to results"
          disabled={!races.length}
          onClick={() => api.current?.fit()}
        >
          <Maximize className="size-4" />
        </button>
      </div>

      <Legend
        brandFilter={props.brandFilter}
        counts={props.brandCounts}
        onToggle={props.onToggleBrand}
        open={legendOpen}
        onOpenChange={setLegendOpen}
        className={props.compactLegend ? 'top-3 left-3' : 'bottom-3 left-3'}
      />
    </div>
  );
}
