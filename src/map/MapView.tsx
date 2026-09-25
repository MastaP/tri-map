/**
 * The world map. Lazy-loaded (React.lazy) so the results list renders before maplibre
 * arrives. Races are a clustered GeoJSON source; clusters and single races are drawn as
 * HTML markers (brand glyphs, glyph fans, SVG donuts) synced from the source on every
 * render.
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
import { MapUnavailable } from '../components/MapUnavailable.tsx';
import type { BrandId } from '../data/brands.ts';
import type { NextEdition } from '../data/nextEdition.ts';
import type { Race } from '../data/types.ts';
import type { Theme } from '../hooks/useTheme.ts';
import { pointsBounds, wrapLng, type Bounds, type LngLat, type MapViewState } from '../lib/geo.ts';
import { cn } from '../lib/cn.ts';
import { Legend } from './Legend.tsx';
import {
  clusterElement,
  clusterPopupContent,
  FAN_MAX,
  hoverPopElement,
  markerSignature,
  raceMarkerElement,
  selectionElement,
  updateHoverPopElement,
  updateSelectionElement,
  type ClusterProps,
} from './markers.ts';

setWorkerUrl(workerUrl);

const SOURCE = 'races';
const MAX_ZOOM = 14;
/** Distance tags (FULL / HALF / T100) under single markers from this zoom on. */
const TAG_ZOOM = 6;
/** Pixels within which races merge into a cluster (maplibre's default is 50). */
const CLUSTER_RADIUS = 34;
/** A basemap style that has not loaded after this long is replaced by the fallback. */
const STYLE_TIMEOUT_MS = 12_000;
/** Below this map width the world does not fit, so the first view shows the home region. */
const NARROW_PX = 640;

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

/** maplibre 6 needs WebGL 2; without it the constructor throws. */
function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export type { MapViewState };

/** Changing `key` fits the map to `points`. */
export interface FocusRequest {
  key: string;
  points: readonly LngLat[];
}

export interface MapViewProps {
  races: Race[];
  /** The edition shown per race (the one matching the date filter); else the next one. */
  editions: ReadonlyMap<string, NextEdition>;
  theme: Theme;
  selectedRace: Race | null;
  hoveredId: string | null;
  brandFilter: BrandId[];
  brandCounts: Record<BrandId, number>;
  onToggleBrand: (b: BrandId) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Viewport and view after every move (the centre feeds the "Nearest" fallback). */
  onViewChange: (b: Bounds, view: MapViewState) => void;
  /** Changing this value fits the map to the current races (region, search, shortlist). */
  fitKey: string;
  /** Changing its key fits these points (e.g. the viewer and the nearest races). */
  focus?: FocusRequest | null;
  /** Start here instead of fitting the races (a shared "In map area" link). */
  initialView?: MapViewState | null;
  /** On a narrow map, the first view fits these (the viewer's region) instead of the world. */
  homePoints?: readonly LngLat[] | null;
  /** Pixels hidden behind an overlay at the bottom (mobile sheets). */
  bottomInset?: number;
  /** Hide the zoom buttons and legend (e.g. under the mobile race sheet). */
  hideControls?: boolean;
  /** Mark the map centre, when "Nearest" measures from it. */
  showCenterMark?: boolean;
  /** The map cannot be shown (no WebGL 2, or maplibre failed to start). */
  onUnavailable: (reason: 'webgl' | 'error') => void;
  legendAt?: 'top-left' | 'bottom-left';
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

interface Api {
  update: () => void;
  highlight: () => void;
  fit: (animate?: boolean, points?: readonly LngLat[] | null) => void;
  setTheme: (theme: Theme) => void;
  reveal: (raceId: string, attempts?: number) => void;
}

export default function MapView(props: MapViewProps) {
  const [webgl] = useState(supportsWebGL2);
  const [crashed, setCrashed] = useState(false);
  const { onUnavailable } = props;
  useEffect(() => {
    if (!webgl) onUnavailable('webgl');
  }, [webgl, onUnavailable]);
  if (!webgl) return <MapUnavailable reason="webgl" />;
  if (crashed) return <MapUnavailable reason="error" onRetry={() => window.location.reload()} />;
  return (
    <MapCanvas
      {...props}
      onCrash={() => {
        setCrashed(true);
        onUnavailable('error');
      }}
    />
  );
}

function MapCanvas(props: MapViewProps & { onCrash: () => void }) {
  const { races, theme, selectedRace, hoveredId, fitKey, focus, bottomInset = 0, hideControls = false } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const selectionRef = useRef<Marker | null>(null);
  const hoverRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const raceByIdRef = useRef(new Map<string, Race>());
  const editionsRef = useLatest(props.editions);
  /** Ids currently in the GeoJSON source, to skip no-op setData calls. */
  const dataKey = useRef('');
  const latest = useLatest(props);
  const [styleReady, setStyleReady] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendOpenRef = useLatest(legendOpen);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const api = useRef<Api | null>(null);

  useLayoutEffect(() => {
    raceByIdRef.current = new Map(races.map((r) => [r.id, r]));
  }, [races]);

  // ---- create the map once --------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current!;
    const initial = latest.current;
    const narrow = container.clientWidth < NARROW_PX;
    let map: MLMap;
    try {
      map = new MLMap({
        container,
        style: BASEMAPS[initial.theme],
        center: [12, 30],
        zoom: 1.3,
        // A phone-width map can only show the whole world zoomed out further.
        minZoom: narrow ? -1 : 0.6,
        maxZoom: MAX_ZOOM,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: true,
        fadeDuration: 120,
      });
    } catch (e) {
      console.warn('The map could not start', e);
      initial.onCrash();
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;
    const editionOf = (r: Race) => editionsRef.current.get(r.id) ?? r.nextEdition;

    // ---- basemap style, with a fallback whenever a style fails to load --------------
    let fallbackActive = false;
    let stylePending = true;
    let styleTimer = 0;
    const switchToFallback = (why: unknown) => {
      if (fallbackActive) return;
      console.warn('Basemap failed to load, using the fallback style', why);
      fallbackActive = true;
      window.clearTimeout(styleTimer);
      setBasemapFailed(true);
      map.setStyle(fallbackStyle(latest.current.theme), { diff: false });
    };
    const watchStyle = () => {
      stylePending = true;
      window.clearTimeout(styleTimer);
      styleTimer = window.setTimeout(() => stylePending && switchToFallback('timeout'), STYLE_TIMEOUT_MS);
    };
    watchStyle();

    const addSource = () => {
      if (map.getSource(SOURCE)) return;
      dataKey.current = latest.current.races.map((r) => r.id).join('|');
      map.addSource(SOURCE, {
        type: 'geojson',
        data: toFeatureCollection(latest.current.races),
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        // Clusters exist up to the last zoom level, so races at one venue stay one
        // clickable marker that opens a list.
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
      stylePending = false;
      window.clearTimeout(styleTimer);
      // A new style drops the old sources: re-add the races and redraw the markers.
      addSource();
      setStyleReady(true);
      api.current?.update();
    });
    map.on('error', (e) => {
      // Only failures while a style is loading matter here; tile errors come and go.
      if (stylePending || !map.isStyleLoaded()) switchToFallback(e.error);
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

    const reportView = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      latest.current.onViewChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], {
        lng: wrapLng(c.lng),
        lat: c.lat,
        zoom: map.getZoom(),
      });
    };
    map.on('moveend', reportView);
    map.once('load', reportView);

    /** Ids of the races in small clusters at a single venue (fetched once per marker). */
    const leafIds = new Map<string, string[]>();

    function update() {
      if (!map.getSource(SOURCE) || !map.isSourceLoaded(SOURCE)) return;
      const markers = markersRef.current;
      const wanted = new Map<string, GeoJSONFeature>();
      for (const f of map.querySourceFeatures(SOURCE)) {
        const p = f.properties as Partial<ClusterProps> & { cluster?: boolean; id?: string };
        let key: string;
        if (p.cluster) {
          // Keyed by content and wrapped position, not cluster_id: with world copies the
          // same cluster comes back under two ids, 360° apart.
          const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
          key = `c:${p.point_count}:${p.ironman}:${p.challenge}:${p.t100}:${p.independent}:${wrapLng(lng).toFixed(3)}:${lat.toFixed(3)}`;
        } else key = `r:${p.id}`;
        if (!wanted.has(key)) wanted.set(key, f);
      }
      for (const [key, m] of markers) {
        if (!wanted.has(key)) {
          m.remove();
          markers.delete(key);
          leafIds.delete(key);
        }
      }
      for (const [key, f] of wanted) {
        const existing = markers.get(key);
        if (existing && key.startsWith('r:')) {
          // Rebuilt when what it shows changed (a date filter picked another edition, or
          // the day rolled over and the next edition moved on).
          const race = raceByIdRef.current.get(key.slice(2));
          if (race && existing.getElement().dataset.sig !== markerSignature(editionOf(race))) {
            existing.remove();
            markers.delete(key);
          }
        }
        if (markers.has(key)) continue;
        const p = f.properties as ClusterProps & { cluster?: boolean; id?: string };
        if (p.cluster) {
          const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
          const el = clusterElement(p, () => void onClusterClick(p.cluster_id, [lng, lat]));
          markers.set(key, new Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
          if (p.point_count <= FAN_MAX) void loadLeaves(key, p.cluster_id);
        } else {
          const race = raceByIdRef.current.get(p.id!);
          if (!race) continue;
          const el = raceMarkerElement(race, editionOf(race), {
            onClick: (id) => latest.current.onSelect(id),
            onHover: (id) => latest.current.onHover(id),
          });
          markers.set(key, new Marker({ element: el, anchor: 'center' }).setLngLat([race.lng, race.lat]).addTo(map));
        }
      }
      highlight();
    }

    async function loadLeaves(key: string, clusterId: number) {
      const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
      if (!src) return;
      try {
        const leaves = await src.getClusterLeaves(clusterId, FAN_MAX, 0);
        // Only races at one venue: the selection glyph then stands for all of them.
        if (!markersRef.current.has(key) || leafSpread(leaves) >= 0.002) return;
        leafIds.set(
          key,
          leaves.map((l) => (l.properties as { id: string }).id),
        );
        highlight();
      } catch {
        /* the cluster is gone (filters changed) */
      }
    }

    function highlight() {
      const { selectedRace: sel, hoveredId: hov } = latest.current;
      for (const [key, m] of markersRef.current) {
        const el = m.getElement();
        if (key.startsWith('r:')) {
          const id = key.slice(2);
          el.classList.toggle('is-selected', id === sel?.id);
          el.classList.toggle('is-hovered', id === hov);
        } else {
          // A small cluster holding the selected race hides under the selection glyph.
          el.classList.toggle('is-covered', !!sel && (leafIds.get(key)?.includes(sel.id) ?? false));
        }
      }
    }

    /** Zoom in until the selected race has its own marker (unless it shares its venue). */
    async function reveal(raceId: string, attempts = 3) {
      if (attempts <= 0 || markersRef.current.has(`r:${raceId}`)) return;
      const race = raceByIdRef.current.get(raceId);
      const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
      if (!race || !src) return;
      const at = map.project([race.lng, race.lat]);
      for (const f of map.querySourceFeatures(SOURCE)) {
        const p = f.properties as Partial<ClusterProps> & { cluster?: boolean };
        if (!p.cluster || p.cluster_id === undefined) continue;
        const [lng, lat] = (f.geometry as Point).coordinates as [number, number];
        const pt = map.project([lng, lat]);
        if (Math.hypot(pt.x - at.x, pt.y - at.y) > CLUSTER_RADIUS * 2) continue;
        try {
          const leaves = await src.getClusterLeaves(p.cluster_id, 500, 0);
          if (!leaves.some((l) => (l.properties as { id: string }).id === raceId)) continue;
          const spread = leafSpread(leaves);
          if (spread < 0.002) return; // same venue: the cluster stays, covered by the selection
          const zoom = await src.getClusterExpansionZoom(p.cluster_id);
          if (mapRef.current !== map || latest.current.selectedRace?.id !== raceId) return;
          if (zoom > MAX_ZOOM || zoom <= map.getZoom()) return;
          map.once('moveend', () => void reveal(raceId, attempts - 1));
          map.easeTo({
            center: [race.lng, race.lat],
            zoom: Math.min(zoom + 0.3, MAX_ZOOM),
            padding: { top: 0, left: 0, right: 0, bottom: latest.current.bottomInset ?? 0 },
            duration: 600,
          });
          return;
        } catch {
          return;
        }
      }
    }

    function leafSpread(leaves: Awaited<ReturnType<GeoJSONSource['getClusterLeaves']>>): number {
      const coords = leaves.map((l) => (l.geometry as Point).coordinates as [number, number]);
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      return Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
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
      if (leafSpread(leaves) < 0.002 || expansion > MAX_ZOOM) {
        const list = leaves
          .map((l) => raceByIdRef.current.get((l.properties as { id: string }).id))
          .filter((r): r is Race => !!r)
          .sort((a, b) => (editionOf(a)?.date ?? '9').localeCompare(editionOf(b)?.date ?? '9'));
        popupRef.current?.remove();
        popupRef.current = new Popup({ offset: 24, maxWidth: '320px', focusAfterOpen: false })
          .setLngLat(lngLat)
          .setDOMContent(
            clusterPopupContent(list, editionOf, (id) => {
              popupRef.current?.remove();
              latest.current.onSelect(id);
            }),
          )
          .addTo(map);
        return;
      }
      map.easeTo({ center: lngLat, zoom: Math.min(expansion + 0.2, MAX_ZOOM) });
    }

    function fitTo(animate = true, points?: readonly LngLat[] | null) {
      const b = pointsBounds(points ?? latest.current.races);
      if (!b) return;
      const bounds = new LngLatBounds([b[0], b[1]], [b[2], b[3]]);
      const w = container.clientWidth;
      // Keep fitted races clear of the zoom buttons (right), the open legend (bottom
      // left) and the attribution (bottom right).
      const legend = legendOpenRef.current && latest.current.legendAt !== 'top-left';
      const side = w < NARROW_PX ? 24 : 56;
      map.fitBounds(bounds, {
        padding: {
          top: w < NARROW_PX ? 56 : 64,
          left: legend ? 236 : side,
          right: w < NARROW_PX ? 56 : 72,
          bottom: (legend ? 48 : 64) + (latest.current.bottomInset ?? 0),
        },
        maxZoom: 7,
        duration: animate ? 900 : 0,
      });
    }

    function setTheme(next: Theme) {
      if (fallbackActive) {
        map.setStyle(fallbackStyle(next), { diff: false });
        return;
      }
      watchStyle();
      map.setStyle(BASEMAPS[next], { diff: false });
    }

    api.current = { update, highlight, fit: fitTo, setTheme, reveal: (id, n) => void reveal(id, n) };

    if (initial.initialView) {
      // A shared "in map area" search: its view decides the results, so it wins over the
      // open race (which was inside that area when the link was made).
      map.jumpTo({ center: [initial.initialView.lng, initial.initialView.lat], zoom: initial.initialView.zoom });
    } else if (initial.selectedRace) {
      map.jumpTo({ center: [initial.selectedRace.lng, initial.selectedRace.lat], zoom: 6 });
      map.once('idle', () => {
        const sel = latest.current.selectedRace;
        if (sel) void reveal(sel.id);
      });
    } else if (narrow && initial.homePoints?.length) {
      fitTo(false, initial.homePoints);
    } else {
      fitTo(false);
    }

    const markers = markersRef.current;
    return () => {
      window.clearTimeout(styleTimer);
      cancelAnimationFrame(frame);
      markers.forEach((m) => m.remove());
      markers.clear();
      selectionRef.current?.remove();
      selectionRef.current = null;
      hoverRef.current?.remove();
      hoverRef.current = null;
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      api.current = null;
    };
  }, [latest, legendOpenRef, editionsRef]);

  // ---- data, theme, highlights ------------------------------------------------------
  useEffect(() => {
    const src = mapRef.current?.getSource(SOURCE) as GeoJSONSource | undefined;
    const key = races.map((r) => r.id).join('|');
    if (!src) return;
    if (key !== dataKey.current) {
      dataKey.current = key;
      src.setData(toFeatureCollection(races));
      popupRef.current?.remove();
    } else {
      // Same races, maybe other editions shown (date filter, a new day): refresh markers.
      api.current?.update();
    }
  }, [races, props.editions]);

  const themeRef = useRef(theme);
  useEffect(() => {
    if (!mapRef.current || themeRef.current === theme) return;
    themeRef.current = theme;
    api.current?.setTheme(theme);
  }, [theme]);

  // The overlays redraw when the edition they show changes (a date filter picks another).
  const selectedEdition = selectedRace ? (props.editions.get(selectedRace.id) ?? selectedRace.nextEdition) : null;
  const selectedSig = markerSignature(selectedEdition);
  const hoveredRace = hoveredId ? races.find((r) => r.id === hoveredId) : undefined;
  const hoveredSig = markerSignature(
    hoveredRace ? (props.editions.get(hoveredRace.id) ?? hoveredRace.nextEdition) : null,
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedRace) {
      selectionRef.current ??= new Marker({ element: selectionElement(), anchor: 'center' });
      updateSelectionElement(
        selectionRef.current.getElement(),
        selectedRace,
        editionsRef.current.get(selectedRace.id) ?? selectedRace.nextEdition,
      );
      selectionRef.current.setLngLat([selectedRace.lng, selectedRace.lat]).addTo(map);
    } else {
      selectionRef.current?.remove();
    }
    api.current?.highlight();
  }, [selectedRace, selectedSig, editionsRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const race = hoveredId ? raceByIdRef.current.get(hoveredId) : undefined;
    // A race with its own marker is highlighted by scaling that marker; the pop-up
    // glyph is for races hidden inside a cluster.
    const hidden = race && !markersRef.current.has(`r:${race.id}`);
    if (race && hidden && race.id !== selectedRace?.id) {
      hoverRef.current ??= new Marker({ element: hoverPopElement(), anchor: 'center' });
      updateHoverPopElement(hoverRef.current.getElement(), race, editionsRef.current.get(race.id) ?? race.nextEdition);
      hoverRef.current.setLngLat([race.lng, race.lat]).addTo(map);
    } else {
      hoverRef.current?.remove();
    }
    api.current?.highlight();
  }, [hoveredId, hoveredSig, selectedRace, editionsRef]);

  // ---- camera ---------------------------------------------------------------------
  const keepInitialView = useRef(!!props.initialView);
  const fitKeyRef = useRef(fitKey);
  useEffect(() => {
    if (fitKeyRef.current === fitKey) return;
    fitKeyRef.current = fitKey;
    api.current?.fit(true);
  }, [fitKey]);

  const focusKeyRef = useRef(focus?.key ?? null);
  useEffect(() => {
    if (!focus || focusKeyRef.current === focus.key) return;
    focusKeyRef.current = focus.key;
    api.current?.fit(true, focus.points);
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    // A race opened together with a shared "in map area" view: leave the camera there.
    const keep = keepInitialView.current;
    keepInitialView.current = false;
    if (!map || !selectedRace || keep) return;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const visibleH = h - bottomInset;
    const pt = map.project([selectedRace.lng, selectedRace.lat]);
    const comfortablyVisible = pt.x > w * 0.12 && pt.x < w * 0.88 && pt.y > visibleH * 0.12 && pt.y < visibleH * 0.88;
    const id = selectedRace.id;
    if (comfortablyVisible && map.getZoom() >= 4.5) {
      api.current?.reveal(id);
      return;
    }
    map.once('moveend', () => api.current?.reveal(id));
    map.flyTo({
      center: [selectedRace.lng, selectedRace.lat],
      zoom: Math.max(map.getZoom(), 6.5),
      padding: { top: 0, left: 0, right: 0, bottom: bottomInset },
      duration: 1300,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only when the selection changes
  }, [selectedRace?.id]);

  const btn =
    'relative grid size-9 place-items-center text-fg transition-colors hover:bg-surface-2 active:bg-surface-3 disabled:opacity-40 pointer-coarse:size-11';

  return (
    <div className="relative isolate size-full overflow-hidden bg-[var(--tm-map-bg)]">
      {/* maplibre forces position:relative on its container, so size it via a wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="size-full" data-testid="race-map" />
      </div>
      <p className="sr-only">Map of the races. Use the results list to browse them with the keyboard.</p>
      {props.showCenterMark && <span className="tm-center-mark z-[5]" aria-hidden="true" data-testid="center-mark" />}

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

      <div
        className={cn(
          'absolute top-3 right-3 z-10 flex flex-col overflow-hidden rounded-xl border border-line bg-surface/95 shadow-card backdrop-blur',
          hideControls && 'hidden',
        )}
      >
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

      {!hideControls && (
        <Legend
          brandFilter={props.brandFilter}
          counts={props.brandCounts}
          onToggle={props.onToggleBrand}
          open={legendOpen}
          onOpenChange={setLegendOpen}
          className={props.legendAt === 'top-left' ? 'top-3 left-3' : 'bottom-3 left-3'}
        />
      )}
    </div>
  );
}
