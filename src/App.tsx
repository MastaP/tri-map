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
import { EmptyState } from './components/EmptyState.tsx';
import { FilterPanel } from './components/FilterPanel.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { RaceDetail } from './components/RaceDetail.tsx';
import { ResultsList } from './components/ResultsList.tsx';
import { ResultsToolbar } from './components/ResultsToolbar.tsx';
import { SearchBox } from './components/SearchBox.tsx';
import { Sheet } from './components/Sheet.tsx';
import { Toast } from './components/Toast.tsx';
import { BRAND_IDS, type BrandId } from './data/brands.ts';
import { loadRaces } from './data/loadRaces.ts';
import { DESKTOP_QUERY, useMediaQuery } from './hooks/useMediaQuery.ts';
import { useShortlist } from './hooks/useShortlist.ts';
import { useToast } from './hooks/useToast.ts';
import { useTheme } from './hooks/useTheme.ts';
import { cn } from './lib/cn.ts';
import { formatMonthShort, localToday } from './lib/dates.ts';
import {
  activeDimensions,
  clearAll,
  clearDimension,
  facetCounts,
  filterRaces,
  monthHistogram,
  sortRaces,
  suggestRelaxations,
  toggleValue,
  type Dimension,
  type Filters,
} from './lib/filters.ts';
import type { Bounds } from './lib/geo.ts';
import { readStorage, writeStorage } from './lib/storage.ts';
import { parseUrlState, serializeUrlState } from './lib/urlState.ts';

const MapView = lazy(() => import('./map/MapView.tsx'));

const FILTERS_COLLAPSED_KEY = 'trimap.filtersCollapsed';

function MapPlaceholder() {
  return (
    <div className="grid size-full place-items-center bg-[var(--tm-map-bg)]" aria-hidden="true">
      <p className="rounded-full bg-surface/90 px-4 py-2 text-sm text-muted shadow-card">Loading map…</p>
    </div>
  );
}

function urlFor(filters: Filters, raceId: string | null): string {
  const qs = serializeUrlState({ filters, raceId });
  return `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
}

const currentUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

export function App() {
  const [today] = useState(localToday);
  const races = useMemo(() => loadRaces(today), [today]);
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const { pref, theme, setPref } = useTheme();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { shortlist, toggle: toggleStar } = useShortlist();
  const toast = useToast();

  const [initial] = useState(() => parseUrlState(window.location.search));
  const [filters, setFilters] = useState<Filters>(initial.filters);
  // A ?race= id that is not (or no longer) in the data is dropped with a notice.
  const [missingRace] = useState(() => !!initial.raceId && !raceById.has(initial.raceId));
  const [selectedId, setSelectedId] = useState<string | null>(() => (missingRace ? null : initial.raceId));
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(() => readStorage(FILTERS_COLLAPSED_KEY) === '1');

  const searchRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const historyMode = useRef<'push' | 'replace'>('replace');
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const selectedRace = selectedId ? (raceById.get(selectedId) ?? null) : null;
  const siblings = useMemo(
    () =>
      selectedRace
        ? races.filter(
            (r) =>
              r.id !== selectedRace.id &&
              Math.abs(r.lat - selectedRace.lat) < 0.01 &&
              Math.abs(r.lng - selectedRace.lng) < 0.01,
          )
        : [],
    [races, selectedRace],
  );

  // ---- derived data -------------------------------------------------------------
  const ctx = useMemo(() => ({ today, bounds, shortlist }), [today, bounds, shortlist]);
  const results = useMemo(() => sortRaces(filterRaces(races, filters, ctx), filters.sort), [races, filters, ctx]);
  // The map shows every filter except "in map area" (and must not re-cluster on pan).
  const mapRaces = useMemo(
    () => filterRaces(races, filters, { today, bounds: null, shortlist }, ['area']),
    [races, filters, today, shortlist],
  );
  const facets = useMemo(() => facetCounts(races, filters, ctx), [races, filters, ctx]);
  const buckets = useMemo(() => monthHistogram(races, filters, ctx), [races, filters, ctx]);
  const anyTimeCount = useMemo(() => filterRaces(races, filters, ctx, ['time']).length, [races, filters, ctx]);
  const suggestions = useMemo(
    () => (results.length ? [] : suggestRelaxations(races, filters, ctx)),
    [results.length, races, filters, ctx],
  );
  const active = activeDimensions(filters);
  const activeCount = active.filter((d) => d !== 'q').length;
  const freshness = useMemo(() => {
    const latest = races.reduce<string | null>((m, r) => (!m || r.verifiedAt > m ? r.verifiedAt : m), null);
    return latest ? formatMonthShort(latest) : null;
  }, [races]);
  const shortlistCount = useMemo(() => races.filter((r) => shortlist.has(r.id)).length, [races, shortlist]);

  // ---- actions -------------------------------------------------------------------
  const updateFilters = useCallback((update: (f: Filters) => Filters) => setFilters(update), []);

  const selectedIdRef = useRef(selectedId);
  useLayoutEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selectRace = useCallback((id: string) => {
    if (selectedIdRef.current === null) {
      // Opening the detail adds a history entry so Back closes it.
      historyMode.current = 'push';
      const el = document.activeElement;
      returnFocusTo.current = el instanceof HTMLElement && el !== document.body ? el : null;
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

  // ---- URL + history -------------------------------------------------------------
  useEffect(() => {
    const url = urlFor(filters, selectedId);
    if (url === currentUrl()) return;
    if (historyMode.current === 'push') {
      historyMode.current = 'replace';
      window.history.pushState({ trimapDetail: true }, '', url);
      return;
    }
    const t = window.setTimeout(() => window.history.replaceState(window.history.state, '', url), 250);
    return () => window.clearTimeout(t);
  }, [filters, selectedId]);

  useEffect(() => {
    const onPop = () => {
      backPending.current = false;
      // Only detail open/close pushes history entries; keep the current filters.
      setSelectedId(parseUrlState(window.location.search).raceId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const showToast = toast.show;
  useEffect(() => {
    if (missingRace) showToast('That race is not listed any more');
  }, [missingRace, showToast]);

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

  const toggleCollapsed = () => {
    setFiltersCollapsed((c) => {
      writeStorage(FILTERS_COLLAPSED_KEY, c ? null : '1');
      return !c;
    });
  };

  const fitKey = `${filters.regions.join(',')}|${filters.shortlistOnly}`;

  const list: ReactNode = results.length ? (
    <ResultsList
      races={results}
      sort={filters.sort}
      today={today}
      selectedId={selectedId}
      hoveredId={hoveredId}
      shortlist={shortlist}
      onSelect={selectRace}
      onHover={setHoveredId}
      onToggleStar={toggleStar}
    />
  ) : (
    <EmptyState
      filters={filters}
      suggestions={suggestions}
      onRelax={relax}
      onClearAll={clearFilters}
      noData={races.length === 0}
    />
  );

  const toolbar = (
    <ResultsToolbar
      count={results.length}
      total={races.length}
      sort={filters.sort}
      onSort={(sort) => setFilters((f) => ({ ...f, sort }))}
      canClear={active.length > 0}
      onClear={clearFilters}
    />
  );

  const filterPanel = (
    <FilterPanel
      filters={filters}
      onChange={updateFilters}
      facets={facets}
      buckets={buckets}
      anyTimeCount={anyTimeCount}
      today={today}
      shortlistCount={shortlistCount}
      mapAvailable={bounds !== null}
    />
  );

  const mobileSheetInset = !isDesktop && selectedRace ? Math.round(window.innerHeight * 0.72) : 0;

  const map = (
    <Suspense fallback={<MapPlaceholder />}>
      <MapView
        races={mapRaces}
        theme={theme}
        selectedRace={selectedRace}
        hoveredId={hoveredId}
        brandFilter={filters.brands}
        brandCounts={facets.brand}
        onToggleBrand={toggleBrand}
        onSelect={selectRace}
        onHover={setHoveredId}
        onBoundsChange={setBounds}
        fitKey={fitKey}
        bottomInset={mobileSheetInset}
        compactLegend={!isDesktop}
      />
    </Suspense>
  );

  const detail = (variant: 'panel' | 'sheet') =>
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
        onSelect={selectRace}
      />
    );

  if (isDesktop) {
    return (
      <div className="flex h-dvh flex-col">
        <Header freshness={freshness} raceCount={races.length} themePref={pref} onThemeChange={setPref} />
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Search and results"
            className="relative flex w-[420px] shrink-0 flex-col border-r border-line bg-surface xl:w-[448px]"
          >
            <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto" inert={!!selectedRace}>
              <div className="flex gap-2 px-4 pt-4 pb-1.5">
                <SearchBox value={filters.q} onChange={setQuery} inputRef={searchRef} className="min-w-0 flex-1" />
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-expanded={!filtersCollapsed}
                  aria-controls="filter-panel"
                  title={filtersCollapsed ? 'Show filters' : 'Hide filters'}
                  className={cn(
                    'relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors',
                    filtersCollapsed
                      ? 'border-line bg-surface-2 text-fg hover:border-line-strong'
                      : 'border-line bg-surface text-muted hover:text-fg',
                  )}
                >
                  <SlidersHorizontal className="size-4" />
                  {activeCount > 0 && (
                    <span className="tabular grid size-5 place-items-center rounded-full bg-ink text-[11px] text-on-ink">
                      {activeCount}
                    </span>
                  )}
                  <ChevronDown className={cn('size-4 transition-transform', !filtersCollapsed && 'rotate-180')} />
                  <span className="sr-only">{filtersCollapsed ? 'Show filters' : 'Hide filters'}</span>
                </button>
              </div>
              <div id="filter-panel" hidden={filtersCollapsed} className="px-4">
                {filterPanel}
              </div>
              {toolbar}
              {list}
              <Footer freshness={freshness} />
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
          </aside>
          <main className="relative min-w-0 flex-1">{map}</main>
        </div>
        <Toast message={toast.message} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <Header compact freshness={freshness} raceCount={races.length} themePref={pref} onThemeChange={setPref} />
      <div className="z-20 flex gap-2 border-b border-line bg-surface px-3 py-2">
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
        <div className="absolute inset-0">{map}</div>
        {mobileView === 'list' && (
          <div ref={listScrollRef} className="absolute inset-0 z-10 overflow-y-auto bg-surface" inert={!!selectedRace}>
            {toolbar}
            {list}
            <Footer freshness={freshness} />
            <div className="h-24" aria-hidden="true" />
          </div>
        )}
        {!selectedRace && (
          <button
            type="button"
            onClick={() => setMobileView((v) => (v === 'list' ? 'map' : 'list'))}
            className="animate-slide-up absolute bottom-[max(2.75rem,env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-on-ink shadow-float active:scale-95"
          >
            {mobileView === 'list' ? (
              <>
                <MapIcon className="size-[18px]" /> Map
              </>
            ) : (
              <>
                <List className="size-[18px]" /> List <span className="tabular opacity-70">{results.length}</span>
              </>
            )}
          </button>
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
              className="h-9 rounded-full px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
            >
              Clear all
            </button>
          )
        }
        footer={
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="h-12 w-full rounded-2xl bg-ink text-[15px] font-semibold text-on-ink active:scale-[0.99]"
          >
            Show {results.length} {results.length === 1 ? 'race' : 'races'}
          </button>
        }
      >
        {filterPanel}
      </Sheet>

      {selectedRace && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={selectedRace.name}
          className="animate-sheet-in fixed inset-x-0 bottom-0 z-40 h-[72dvh] overflow-hidden rounded-t-3xl border-t border-line shadow-float"
        >
          {detail('sheet')}
        </div>
      )}
      <Toast message={toast.message} />
    </div>
  );
}
