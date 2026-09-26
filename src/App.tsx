import { ChevronDown, List, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActiveFilters } from './components/ActiveFilters.tsx';
import { DetailSheet } from './components/DetailSheet.tsx';
import { sheetHeight, type SheetSnap } from './components/sheetSnap.ts';
import { EmptyState } from './components/EmptyState.tsx';
import { FilterPanel, QuickFilters } from './components/FilterPanel.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { MapBoundary } from './components/MapBoundary.tsx';
import { RaceDetail } from './components/RaceDetail.tsx';
import { ResultsList } from './components/ResultsList.tsx';
import { ResultsNotes } from './components/ResultsNotes.tsx';
import { ResultsToolbar } from './components/ResultsToolbar.tsx';
import { SearchBox } from './components/SearchBox.tsx';
import { Sheet } from './components/Sheet.tsx';
import { Toast } from './components/Toast.tsx';
import { BRAND_IDS, type BrandId } from './data/brands.ts';
import { loadRaces, loadRegistrationSources } from './data/loadRaces.ts';
import { useGeolocation } from './hooks/useGeolocation.ts';
import { DESKTOP_QUERY, useMediaQuery } from './hooks/useMediaQuery.ts';
import { useShortlist } from './hooks/useShortlist.ts';
import { useToast } from './hooks/useToast.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useToday } from './hooks/useToday.ts';
import { copyText } from './lib/clipboard.ts';
import { cn } from './lib/cn.ts';
import { formatDate, formatMonthShort } from './lib/dates.ts';
import { whenIdle } from './lib/idle.ts';
import {
  activeDimensions,
  clampTimeToToday,
  clearAll,
  clearDimension,
  facetCounts,
  filterRaces,
  hiddenByEstimates,
  isListed,
  missingCourseRaces,
  monthHistogram,
  searchesPeriod,
  shownEditions,
  soldOutCount,
  sortRaces,
  suggestRelaxations,
  toggleValue,
  type Dimension,
  type Filters,
  type SortKey,
} from './lib/filters.ts';
import type { Bounds, LngLat, MapViewState } from './lib/geo.ts';
import { viewerRegion } from './lib/homeRegion.ts';
import { distancesFrom, type Origin } from './lib/nearest.ts';
import { readStorage, writeStorage } from './lib/storage.ts';
import { parseUrlState, serializeUrlState } from './lib/urlState.ts';
import { importMapView, importMapViewOrReload } from './map/loadMap.ts';

const MapView = lazy(importMapViewOrReload);

/** Desktop: whether the full filter panel is open ('1'); closed by default. */
const MORE_FILTERS_KEY = 'trimap.moreFilters';
const DEFAULT_TITLE = 'TriMap · Find a full, half or T100 triathlon to enter';
/** Filters that live behind the desktop "Filters" button (distance and dates stay in view). */
const PANEL_DIMENSIONS: readonly Dimension[] = [
  'region',
  'brand',
  'bike',
  'run',
  'entry',
  'soldout',
  'estimated',
  'area',
  'shortlist',
];

function MapPlaceholder() {
  return (
    <div className="grid size-full place-items-center bg-[var(--tm-map-bg)]" aria-hidden="true">
      <p className="rounded-full bg-surface/90 px-4 py-2 text-sm text-muted shadow-card">Loading map…</p>
    </div>
  );
}

function LiveCount({ count }: { count: number }) {
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {count} {count === 1 ? 'race' : 'races'}
    </p>
  );
}

function urlFor(filters: Filters, raceId: string | null, bounds: Bounds | null): string {
  const qs = serializeUrlState({ filters, raceId, bounds });
  return `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
}

const currentUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return out;
}

export function App() {
  const today = useToday();
  const races = useMemo(() => loadRaces(today), [today]);
  const registrationSources = useMemo(() => loadRegistrationSources(today), [today]);
  // Every race, including ones without a next edition, so deep links keep working.
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const listedCount = useMemo(() => races.filter(isListed).length, [races]);
  const { pref, theme, setPref } = useTheme();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { shortlist, toggle: toggleStar } = useShortlist();
  const toast = useToast();

  const [initial] = useState(() => {
    const state = parseUrlState(window.location.search);
    // A date range from an old link: past months hold no races any more.
    const { time, expired } = clampTimeToToday(state.filters.time, today);
    return { ...state, filters: { ...state.filters, time }, expired };
  });
  const [filters, setFilters] = useState<Filters>(initial.filters);
  // A ?race= id that is not (or no longer) in the data is dropped with a notice.
  const [missingRace] = useState(() => !!initial.raceId && !raceById.has(initial.raceId));
  const [selectedId, setSelectedId] = useState<string | null>(() => (missingRace ? null : initial.raceId));
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // A shared "in map area" link's box decides the results until the viewer moves the map:
  // their screen shows at least that area, usually more (another size or shape).
  const [bounds, setBounds] = useState<Bounds | null>(initial.bounds ?? null);
  const sharedBox = useRef(initial.bounds ?? null);
  const [mapView, setMapView] = useState<MapViewState | null>(initial.view ?? null);
  const [mapFailed, setMapFailed] = useState(false);
  const geo = useGeolocation();
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => readStorage(MORE_FILTERS_KEY) === '1');
  const [detailSnap, setDetailSnap] = useState<SheetSnap>('full');
  const [missingOpen, setMissingOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const historyMode = useRef<'push' | 'replace'>('replace');
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const selectedRace = selectedId ? (raceById.get(selectedId) ?? null) : null;
  // Other races to enter at the same venue. A predecessor/successor pair is linked
  // explicitly instead ("Continues as" / "Formerly"), so it is not repeated here.
  const siblings = useMemo(
    () =>
      selectedRace
        ? races.filter(
            (r) =>
              r.id !== selectedRace.id &&
              isListed(r) &&
              r.continuedAs !== selectedRace.id &&
              selectedRace.continuedAs !== r.id &&
              Math.abs(r.lat - selectedRace.lat) < 0.01 &&
              Math.abs(r.lng - selectedRace.lng) < 0.01,
          )
        : [],
    [races, selectedRace],
  );
  const successor = selectedRace?.continuedAs ? (raceById.get(selectedRace.continuedAs) ?? null) : null;
  const predecessors = useMemo(
    () => (selectedRace ? selectedRace.formerly.flatMap((id) => raceById.get(id) ?? []) : []),
    [selectedRace, raceById],
  );

  // ---- derived data -------------------------------------------------------------
  const ctx = useMemo(() => ({ today, bounds, shortlist }), [today, bounds, shortlist]);
  // "Nearest": the viewer's location once they allowed it, else the map centre.
  const origin = useMemo<Origin | null>(() => {
    if (filters.sort !== 'near') return null;
    if (geo.position) return { ...geo.position, source: 'location' };
    return mapView && !mapFailed ? { lng: mapView.lng, lat: mapView.lat, source: 'map' } : null;
  }, [filters.sort, geo.position, mapView, mapFailed]);
  const filtered = useMemo(() => filterRaces(races, filters, ctx), [races, filters, ctx]);
  const shown = useMemo(() => shownEditions(filtered, filters, today), [filtered, filters, today]);
  const results = useMemo(
    () => sortRaces(filtered, filters.sort, origin, shown),
    [filtered, filters.sort, origin, shown],
  );
  const distances = useMemo(() => (origin ? distancesFrom(results, origin) : null), [results, origin]);
  const missingCourse = useMemo(() => {
    const list = missingCourseRaces(races, filters, ctx);
    return sortRaces(list, 'date', null, shownEditions(list, filters, today));
  }, [races, filters, ctx, today]);
  // Editions to show: the results' and, for the "Course not listed yet" group, those races'.
  const listShown = useMemo(
    () => new Map([...shownEditions(missingCourse, filters, today), ...shown]),
    [missingCourse, filters, today, shown],
  );
  // The map shows every filter except "in map area" (and must not re-cluster on pan).
  const mapRaces = useMemo(
    () => filterRaces(races, filters, { today, bounds: null, shortlist }, ['area']),
    [races, filters, today, shortlist],
  );
  const mapEditions = useMemo(() => shownEditions(mapRaces, filters, today), [mapRaces, filters, today]);
  const facets = useMemo(() => facetCounts(races, filters, ctx), [races, filters, ctx]);
  const buckets = useMemo(() => monthHistogram(races, filters, ctx), [races, filters, ctx]);
  const anyTimeCount = useMemo(() => filterRaces(races, filters, ctx, ['time']).length, [races, filters, ctx]);
  const suggestions = useMemo(
    () => (results.length ? [] : suggestRelaxations(races, filters, ctx)),
    [results.length, races, filters, ctx],
  );
  const active = activeDimensions(filters);
  const activeCount = active.filter((d) => d !== 'q').length;
  const panelCount = active.filter((d) => PANEL_DIMENSIONS.includes(d)).length;
  const freshness = useMemo(() => {
    const latest = races.reduce<string | null>((m, r) => (!m || r.verifiedAt > m ? r.verifiedAt : m), null);
    return latest ? formatMonthShort(latest) : null;
  }, [races]);
  // Starred races that can still be listed (a starred race that was replaced is not).
  const shortlistCount = useMemo(
    () => races.filter((r) => isListed(r) && shortlist.has(r.id)).length,
    [races, shortlist],
  );
  // Races "Hide sold out" hides, or would hide.
  const soldOut = useMemo(() => soldOutCount(races, filters, ctx), [races, filters, ctx]);
  // Races left out only because their date is not announced yet (estimated dates off).
  const estimatedHidden = useMemo(() => hiddenByEstimates(races, filters, ctx), [races, filters, ctx]);
  // Starred races the other filters hide. Those that match everything but have no date
  // announced yet (estimated dates off) are counted by the estimated-dates note instead.
  const starredHidden = filters.shortlistOnly ? Math.max(0, shortlistCount - results.length - estimatedHidden) : 0;
  // "Half" alone hides the T100 (100 km) races, many of them former Challenge halves.
  const t100Alongside = useMemo(
    () =>
      filters.distances.length === 1 && filters.distances[0] === 'half'
        ? filterRaces(races, { ...filters, distances: ['t100'] }, ctx).length
        : 0,
    [races, filters, ctx],
  );

  // ---- actions -------------------------------------------------------------------
  const updateFilters = useCallback((update: (f: Filters) => Filters) => setFilters(update), []);

  const selectedIdRef = useRef(selectedId);
  const mobileViewRef = useRef(mobileView);
  useLayoutEffect(() => {
    selectedIdRef.current = selectedId;
    mobileViewRef.current = mobileView;
  }, [selectedId, mobileView]);

  const selectRace = useCallback((id: string) => {
    if (selectedIdRef.current === null) {
      // Opening the detail adds a history entry so Back closes it.
      historyMode.current = 'push';
      const el = document.activeElement;
      returnFocusTo.current = el instanceof HTMLElement && el !== document.body ? el : null;
      // Mobile: from the list the sheet opens tall; from the map it peeks so the pin stays in view.
      setDetailSnap(mobileViewRef.current === 'map' ? 'peek' : 'full');
    }
    selectedIdRef.current = id;
    setSelectedId(id);
    setHoveredId(null);
  }, []);

  // history.back() is async: until popstate arrives, history.state still says "detail",
  // so a second Esc/close must not go back again (that would leave the site).
  const backPending = useRef(false);
  const closeRace = useCallback(() => {
    if (backPending.current) return;
    if ((window.history.state as { trimapDetail?: boolean } | null)?.trimapDetail) {
      backPending.current = true;
      window.history.back(); // popstate clears the selection
    } else {
      setSelectedId(null);
    }
  }, []);

  const toggleBrand = useCallback(
    (b: BrandId) => setFilters((f) => ({ ...f, brands: toggleValue(f.brands, b, BRAND_IDS) })),
    [],
  );

  const relax = useCallback((d: Dimension) => setFilters((f) => clearDimension(f, d)), []);
  const clearFilters = useCallback(() => setFilters((f) => clearAll(f)), []);
  const clearCourse = useCallback(() => setFilters((f) => ({ ...f, bike: [], run: [] })), []);
  const showAllStarred = useCallback(
    () => setFilters((f) => ({ ...clearAll(f), shortlistOnly: true, showEstimated: f.showEstimated })),
    [],
  );
  const showEstimated = useCallback(() => setFilters((f) => ({ ...f, showEstimated: true })), []);
  const includeT100 = useCallback(() => setFilters((f) => ({ ...f, distances: ['half', 't100'] })), []);
  const showMissingCourse = useCallback(() => {
    setMissingOpen(true);
    requestAnimationFrame(() =>
      document.getElementById('missing-course')?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  }, []);

  const requestLocation = geo.request;
  const geoStatus = geo.status;
  const setSort = useCallback(
    (sort: SortKey) => {
      setFilters((f) => ({ ...f, sort }));
      // Location is only asked for when the viewer picks "Nearest" themselves.
      if (sort === 'near' && geoStatus === 'idle') requestLocation();
    },
    [geoStatus, requestLocation],
  );

  const onViewChange = useCallback((b: Bounds, view: MapViewState, settling: boolean) => {
    setMapView(view);
    // The first view of a shared "in map area" link fits its box; the box stays the
    // filter (the viewport around it is larger) until the map moves on.
    if (settling && sharedBox.current) return;
    sharedBox.current = null;
    setBounds(b);
  }, []);
  const onMapUnavailable = useCallback(() => {
    setMapFailed(true);
    setBounds(null);
    // Without a map there is no area to filter by: drop the filter rather than claim it.
    setFilters((f) => (f.inMapArea ? { ...f, inMapArea: false } : f));
  }, []);

  const showToast = toast.show;
  const shareSearch = useCallback(async () => {
    const url = new URL(urlFor(filters, null, bounds), window.location.href).toString();
    showToast((await copyText(url)) ? 'Link to this search copied' : 'Could not copy the link');
  }, [filters, bounds, showToast]);

  // ---- URL + history -------------------------------------------------------------
  const urlBounds = filters.inMapArea ? bounds : null;
  useEffect(() => {
    const url = urlFor(filters, selectedId, urlBounds);
    if (url === currentUrl()) return;
    if (historyMode.current === 'push') {
      historyMode.current = 'replace';
      window.history.pushState({ trimapDetail: true }, '', url);
      return;
    }
    const t = window.setTimeout(() => window.history.replaceState(window.history.state, '', url), 250);
    return () => window.clearTimeout(t);
  }, [filters, selectedId, urlBounds]);

  useEffect(() => {
    const onPop = () => {
      backPending.current = false;
      // Only detail open/close pushes history entries; keep the current filters.
      setSelectedId(parseUrlState(window.location.search).raceId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (missingRace) showToast('That race is not listed any more');
    else if (initial.expired) showToast('That date range has passed: showing all dates');
  }, [missingRace, initial.expired, showToast]);

  // Tab title names the open race (history entries and bookmarks too).
  useEffect(() => {
    if (!selectedRace) {
      document.title = DEFAULT_TITLE;
      return;
    }
    const next = selectedRace.nextEdition;
    const when = !next
      ? null
      : !next.estimated
        ? formatDate(next.date)
        : filters.showEstimated
          ? `≈ ${formatMonthShort(next.date)}`
          : null;
    document.title = [selectedRace.name, when, 'TriMap'].filter(Boolean).join(' · ');
  }, [selectedRace, filters.showEstimated]);

  // Return focus to where the user was when the detail closes.
  const prevSelected = useRef(selectedId);
  useEffect(() => {
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (prev && !selectedId) {
      const target = returnFocusTo.current;
      returnFocusTo.current = null;
      requestAnimationFrame(() => {
        if (target?.isConnected) target.focus({ preventScroll: false });
        else {
          const card = listScrollRef.current?.querySelector<HTMLElement>(
            `[data-race-id="${CSS.escape(prev)}"] h4 button`,
          );
          card?.focus({ preventScroll: true });
          card?.closest('li')?.scrollIntoView({ block: 'nearest' });
        }
      });
    }
  }, [selectedId]);

  // ---- keyboard shortcuts ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (!isDesktop) setMobileView('list');
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape' && selectedId && !filtersOpen) {
        closeRace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, filtersOpen, closeRace, isDesktop]);

  const setQuery = useCallback((q: string) => setFilters((f) => ({ ...f, q })), []);

  const toggleMore = () => {
    setMoreOpen((open) => {
      writeStorage(MORE_FILTERS_KEY, open ? null : '1');
      return !open;
    });
  };

  // ---- map: when to load it, where to look -------------------------------------------
  // Phones start on the list: the map (maplibre, worker, tiles) loads when it is needed.
  const needMap = isDesktop || mobileView === 'map' || filters.inMapArea || (filters.sort === 'near' && !geo.position);
  const [mapMounted, setMapMounted] = useState(needMap);
  if (needMap && !mapMounted) setMapMounted(true);
  useEffect(() => {
    if (isDesktop || mapMounted) return;
    // Fetch the map code once the list and fonts are done, so "Map" opens quickly.
    let cancelIdle = () => {};
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (cancelled) return;
      cancelIdle = whenIdle(() => void importMapView().catch(() => {}), 4000);
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [isDesktop, mapMounted]);

  const qFit = useDebounced(filters.q.trim(), 450);
  const fitKey = `${filters.regions.join(',')}|${filters.shortlistOnly}|${qFit}`;
  // "Nearest" from the viewer's location: show them and the closest races.
  const nearFocus = useMemo(() => {
    if (filters.sort !== 'near' || !geo.position) return null;
    const pos = geo.position;
    const points: LngLat[] = [pos, ...sortRaces(mapRaces, 'near', pos).slice(0, 5)];
    return { key: `${pos.lat.toFixed(3)},${pos.lng.toFixed(3)}`, points };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only when the position arrives
  }, [filters.sort, geo.position]);
  // A phone-sized map opens on the viewer's region (from the time zone) instead of a clipped world.
  const [homePoints] = useState<LngLat[] | null>(() => {
    if (initial.filters.regions.length || initial.raceId || initial.bounds || initial.view) return null;
    const region = viewerRegion();
    const pts = region ? races.filter((r) => isListed(r) && r.region === region) : [];
    return pts.length >= 3 ? pts : null;
  });

  const mobileSheetInset = !isDesktop && selectedRace ? sheetHeight(detailSnap) : 0;

  // ---- pieces ----------------------------------------------------------------------
  const list: ReactNode = (
    <>
      {results.length ? null : (
        <EmptyState
          filters={filters}
          suggestions={suggestions}
          onRelax={relax}
          onClearAll={clearFilters}
          noData={listedCount === 0}
          missingCourse={missingCourse.length}
          estimatedHidden={estimatedHidden}
          inPeriod={searchesPeriod(filters)}
          onShowEstimated={showEstimated}
        />
      )}
      {(results.length > 0 || missingCourse.length > 0) && (
        <ResultsList
          races={results}
          shown={listShown}
          sort={filters.sort}
          today={today}
          selectedId={selectedId}
          hoveredId={hoveredId}
          shortlist={shortlist}
          onSelect={selectRace}
          onHover={setHoveredId}
          onToggleStar={toggleStar}
          distances={distances}
          foldSoon={filters.sort === 'date' && !filters.q.trim() && !filters.shortlistOnly}
          showCourse={filters.shortlistOnly}
          missingCourse={missingCourse}
          missingOpen={missingOpen}
          onMissingOpenChange={setMissingOpen}
        />
      )}
    </>
  );

  const toolbar = (
    <>
      <h2 className="sr-only" id="results-title">
        Results
      </h2>
      <ResultsToolbar
        count={results.length}
        total={listedCount}
        sort={filters.sort}
        onSort={setSort}
        canClear={active.length > 0}
        onClear={clearFilters}
        onShare={shareSearch}
        live={isDesktop || !filtersOpen}
      />
      <ResultsNotes
        nearest={filters.sort === 'near' ? { origin, geo: geoStatus, mapAvailable: !mapFailed } : null}
        missingCourse={results.length ? missingCourse.length : 0}
        onUseLocation={requestLocation}
        onShowMissingCourse={showMissingCourse}
        onClearCourse={clearCourse}
        starredHidden={starredHidden}
        onShowAllStarred={showAllStarred}
        t100Alongside={t100Alongside}
        onIncludeT100={includeT100}
        estimatedHidden={results.length ? estimatedHidden : 0}
        inPeriod={searchesPeriod(filters)}
        onShowEstimated={showEstimated}
      />
    </>
  );

  const panelProps = {
    filters,
    onChange: updateFilters,
    facets,
    buckets,
    anyTimeCount,
    today,
    shortlistCount,
    mapAvailable: !mapFailed,
    missingCourse: missingCourse.length,
    soldOut,
  };

  const map = mapMounted ? (
    <MapBoundary onError={onMapUnavailable} onShowList={isDesktop ? undefined : () => setMobileView('list')}>
      <Suspense fallback={<MapPlaceholder />}>
        <MapView
          races={mapRaces}
          editions={mapEditions}
          theme={theme}
          selectedRace={selectedRace}
          hoveredId={hoveredId}
          brandFilter={filters.brands}
          brandCounts={facets.brand}
          onToggleBrand={toggleBrand}
          onSelect={selectRace}
          onHover={setHoveredId}
          onViewChange={onViewChange}
          fitKey={fitKey}
          focus={nearFocus}
          initialView={initial.view ?? null}
          initialBounds={initial.bounds ?? null}
          homePoints={homePoints}
          bottomInset={mobileSheetInset}
          hideControls={!isDesktop && !!selectedRace}
          showCenterMark={filters.sort === 'near' && origin?.source === 'map'}
          onUnavailable={onMapUnavailable}
          legendAt={isDesktop ? 'bottom-left' : 'top-left'}
        />
      </Suspense>
    </MapBoundary>
  ) : (
    <MapPlaceholder />
  );

  const detail = (variant: 'panel' | 'sheet', handle?: ReactNode) =>
    selectedRace && (
      <RaceDetail
        race={selectedRace}
        today={today}
        starred={shortlist.has(selectedRace.id)}
        onToggleStar={toggleStar}
        onClose={closeRace}
        onToast={toast.show}
        variant={variant}
        siblings={siblings}
        successor={successor}
        predecessors={predecessors}
        onSelect={selectRace}
        handle={handle}
        showEstimated={filters.showEstimated}
        onShowEstimated={showEstimated}
      />
    );

  const skipLink = (
    <a
      href="#results-title"
      className="sr-only z-[70] rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 pointer-coarse:py-3"
      onClick={(e) => {
        e.preventDefault();
        setMobileView('list');
        requestAnimationFrame(() => {
          const target = listScrollRef.current?.querySelector<HTMLElement>('li[data-race-id] h4 button');
          (target ?? document.getElementById('results-title'))?.focus();
        });
      }}
    >
      Skip to results
    </a>
  );
  const heading = <h1 className="sr-only">TriMap: full, half and T100 triathlons you can enter</h1>;

  if (isDesktop) {
    return (
      <div className="flex h-dvh flex-col">
        {skipLink}
        <Header freshness={freshness} raceCount={listedCount} themePref={pref} onThemeChange={setPref} />
        <div className="flex min-h-0 flex-1">
          <main className="relative flex w-[360px] shrink-0 flex-col border-r border-line bg-surface lg:w-[420px] xl:w-[448px]">
            {heading}
            <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto" inert={!!selectedRace}>
              <div className="px-4">
                <div role="search" className="flex gap-2 pt-4 pb-2">
                  <SearchBox value={filters.q} onChange={setQuery} inputRef={searchRef} className="min-w-0 flex-1" />
                  <button
                    type="button"
                    onClick={toggleMore}
                    aria-expanded={moreOpen}
                    aria-controls="filter-panel"
                    aria-label={`Filters${panelCount ? `, ${panelCount} active` : ''}`}
                    className={cn(
                      'relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors',
                      moreOpen || panelCount
                        ? 'border-line-strong bg-surface-2 text-fg'
                        : 'border-line bg-surface text-fg hover:border-line-strong',
                    )}
                  >
                    <SlidersHorizontal className="size-4" aria-hidden="true" />
                    Filters
                    {panelCount > 0 && (
                      <span
                        className="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-on-ink"
                        aria-hidden="true"
                      >
                        {panelCount}
                      </span>
                    )}
                    <ChevronDown
                      className={cn('size-4 text-muted transition-transform max-lg:hidden', moreOpen && 'rotate-180')}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <h2 className="sr-only">Filters</h2>
                <QuickFilters filters={filters} onChange={updateFilters} facets={facets} today={today} />
                {!moreOpen && <ActiveFilters filters={filters} active={active} onClear={relax} />}
                <div id="filter-panel" hidden={!moreOpen} className="border-t border-line">
                  {moreOpen && <FilterPanel {...panelProps} variant="more" />}
                </div>
              </div>
              {toolbar}
              {list}
              <Footer freshness={freshness} registration={registrationSources} />
            </div>
            {selectedRace && (
              <div
                className="animate-slide-in absolute inset-0 z-20"
                role="dialog"
                aria-modal="false"
                aria-label={selectedRace.name}
              >
                {detail('panel')}
              </div>
            )}
          </main>
          <section aria-label="Race map" className="relative min-w-0 flex-1">
            {map}
          </section>
        </div>
        <Toast message={toast.message} />
      </div>
    );
  }

  const sheetFull = !!selectedRace && detailSnap === 'full';
  return (
    <div className="flex h-dvh flex-col">
      {skipLink}
      <Header compact freshness={freshness} raceCount={listedCount} themePref={pref} onThemeChange={setPref} />
      <div role="search" className="z-20 flex gap-2 border-b border-line bg-surface px-3 py-2" inert={sheetFull}>
        <SearchBox
          value={filters.q}
          onChange={setQuery}
          inputRef={searchRef}
          className="min-w-0 flex-1"
          placeholder="Race, city or country"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={cn(
            'relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors',
            activeCount ? 'border-ink bg-ink text-on-ink' : 'border-line bg-surface-2 text-fg',
          )}
          aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeCount > 0 && (
            <span className="tabular grid size-5 place-items-center rounded-full bg-accent text-[11px] text-accent-ink">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <main className="relative min-h-0 flex-1">
        {heading}
        {/* Before the list in the tab order; shown floating at the bottom. */}
        {!selectedRace && (
          <button
            type="button"
            onClick={() => setMobileView((v) => (v === 'list' ? 'map' : 'list'))}
            className="animate-slide-up absolute bottom-[max(2.75rem,env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-on-ink shadow-float active:scale-95"
          >
            {mobileView === 'list' ? (
              <>
                <MapIcon className="size-[18px]" aria-hidden="true" /> Map
              </>
            ) : (
              <>
                <List className="size-[18px]" aria-hidden="true" /> List{' '}
                <span className="tabular opacity-70">{results.length}</span>
              </>
            )}
          </button>
        )}
        <section aria-label="Race map" className="absolute inset-0" inert={mobileView === 'list' || sheetFull}>
          {map}
        </section>
        {mobileView === 'list' ? (
          <div ref={listScrollRef} className="absolute inset-0 z-10 overflow-y-auto bg-surface" inert={!!selectedRace}>
            {toolbar}
            {list}
            <Footer freshness={freshness} registration={registrationSources} />
            <div className="h-24" aria-hidden="true" />
          </div>
        ) : (
          !filtersOpen && <LiveCount count={results.length} />
        )}
      </main>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        headerExtra={
          active.length > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-full px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg pointer-coarse:h-11"
            >
              Clear all
            </button>
          )
        }
        footer={
          <>
            <LiveCount count={results.length} />
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="h-12 w-full rounded-2xl bg-ink text-[15px] font-semibold text-on-ink active:scale-[0.99]"
            >
              Show {results.length} {results.length === 1 ? 'race' : 'races'}
            </button>
          </>
        }
      >
        <FilterPanel {...panelProps} variant="sheet" />
      </Sheet>

      {selectedRace && (
        <DetailSheet label={selectedRace.name} snap={detailSnap} onSnapChange={setDetailSnap} onClose={closeRace}>
          {(handle) => detail('sheet', handle)}
        </DetailSheet>
      )}
      <Toast message={toast.message} />
    </div>
  );
}
