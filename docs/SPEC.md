# TriMap: product and technical spec

A fast, good-looking, static search portal for long-distance triathlons. A triathlete
should find a suitable race by **distance**, **time** and **region** within seconds,
across every major brand, on a world map where each brand is recognisable at a glance.

Scope for v1: full distance (3.8/180/42.2), half distance (1.9/90/21.1) and T100
(2/80/18) races from IRONMAN / IRONMAN 70.3, Challenge Family, the T100 Triathlon World
Tour, and notable independent races. Data contract: `data/README.md`.

Hosting: GitHub Pages, fully static, no backend, no API keys.

## Stack

- Vite + React 19 + TypeScript (strict), npm.
- Tailwind CSS v4 (`@tailwindcss/vite`).
- `maplibre-gl` used directly (no React wrapper), lazy-loaded so the list is usable
  before the map chunk arrives.
- Basemap: free keyless vector styles. CARTO Positron / Dark Matter GL styles
  (`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`,
  `.../dark-matter-gl-style/style.json`) or OpenFreeMap; must switch with the theme and
  show attribution.
- `zod` for the data schema; `tsx` to run scripts.
- Self-hosted fonts via `@fontsource*` (no runtime calls to Google Fonts).
- Vitest (unit) + Playwright (`@playwright/test`, chromium) for e2e/smoke.
- Vite `base: './'` so the build works under any GitHub Pages sub-path.

## Data layer

- `src/data/schema.ts`: zod schema that implements `data/README.md` exactly.
- `src/data/regions.ts`: ISO country code → `{ name, region, flag emoji }` for every
  country likely to host a race (all of Europe, the Americas, Asia, Oceania, Middle East,
  Africa). Regions: `europe`, `north-america` (US, CA, BM), `latin-america` (MX, Central
  & South America, Caribbean), `middle-east` (AE, BH, OM, QA, SA, IL, JO, KW), `africa`
  (incl. EG, MA, ZA), `asia`, `oceania`. Turkey and Cyprus are `europe`.
- `src/data/brands.ts`: per-brand label, colour, marker shape, monogram. Do NOT use
  official logos (trademarks); use original monogram glyphs. Brands must be
  distinguishable by **shape and colour** (colour-blind safe), e.g. IRONMAN red
  circle "IM", Challenge blue rounded-square "C", T100 violet hexagon "T", Independent
  amber diamond "★"/"I". Pick a palette that works on light and dark basemaps.
- `src/data/loadRaces.ts`: `import.meta.glob('/data/races/*.json', { eager: true })`,
  parse with zod, derive per race: `region`, `countryName`, `flag`, `nextEdition`.
- **Next edition logic** (pure, unit-tested, `today` injected):
  first edition with `date >= today` and status ≠ cancelled. If none, estimate one
  from the latest non-cancelled edition + 364 days (same weekday), repeated until it
  is ≥ today, flagged `estimated: true`. The UI shows estimated dates distinctly
  ("≈ Jun 2027 · date TBA") and they can be toggled off.
- `scripts/validate-data.ts` (`npm run validate:data`): zod-validate every file, unique
  ids across files, id format, editions sorted, known country code, lat/lng inside a
  coarse bounding box for the country's region, https urls, prints a summary table
  (counts per brand × distance × region, count with no upcoming confirmed date).
  Non-zero exit on any error. Warnings (e.g. no edition after today) do not fail.

## UX

Layout (desktop ≥ 1024px): left sidebar (~420px) with search, filters and results;
map fills the rest. Mobile: map/list toggle, filters in a collapsible sheet, results
as a scrollable list; everything reachable with a thumb.

Header: product name "TriMap", tagline, theme toggle (system/light/dark), link to the
GitHub repo, data freshness ("Race data checked Sep 2026").

### Filters (all combinable; state mirrored to the URL query so searches are shareable)

- **Search**: free text over race name, city, country name; accent- and
  case-insensitive; `/` focuses it.
- **Distance**: multi-select toggles Full (3.8 / 180 / 42.2), Half (1.9 / 90 / 21.1),
  T100 (2 / 80 / 18).
- **Brand**: multi-select chips that show the brand marker glyph; the map legend
  toggles the same state.
- **Region**: multi-select chips (Europe, North America, Latin America, Middle East,
  Africa, Asia, Oceania).
- **Time**: a month timeline/histogram from the current month to the last month with
  data; bar height = number of races matching the *other* filters; click or drag to
  select a month range. Presets: Next 3 months, Next 6 months, Rest of this year, Next
  year, Any time. Races are placed by their next edition date.
- **Show estimated dates** toggle (default on).
- **Only in map area** toggle: restrict results to the current map viewport.
- **Shortlist**: star races (localStorage); a "Shortlist only" toggle.
- Result count and a "Clear filters" action. Empty state with a helpful suggestion.

### Results list

Sorted by next date (alternative: name). Grouped under sticky month headers. Each card:
brand marker, distance badge, name, championship badge if any, date (weekday + date;
estimated dates styled differently), countdown ("in 5 weeks"), city + country flag,
star. Hover highlights the map marker; click selects.

### Map

- GeoJSON source of the filtered races, clustered. Clusters are HTML markers drawn as
  SVG donuts whose segments show the brand mix, with the count in the middle.
- Single races are HTML markers in the brand's shape/colour/monogram, with a subtle
  distance cue (e.g. a small "140.6" / "70.3" / "100" tag appearing at higher zooms, or
  ring style). Estimated-date races use a dashed/faded outline.
- Click a cluster → zoom to expansion; if the cluster cannot expand (co-located races),
  open a popup listing its races.
- Hover/select sync with the list; selecting a race flies to it.
- Legend (brands) doubling as brand filter. Fit-to-results button. Attribution visible.

### Race detail

Opens in the sidebar (bottom sheet on mobile) when a race is selected; deep-linkable via
`?race=<id>`. Shows: name, brand/series, distance with swim/bike/run, championship, next
date + countdown, all known editions (past ones greyed), location + flag, swim type,
notes, buttons: Official website, Add to calendar (.ics download, all-day event),
Copy link, Star. Sources and "verified at" in small print. Esc closes.

### Quality bar

- Looks polished: deliberate typography (a sporty display face for headings + a clean
  UI face), consistent spacing, subtle motion, light and dark themes.
- Accessible: keyboard navigable, visible focus, aria labels, brand identity not by
  colour alone, respects `prefers-reduced-motion`, contrast AA.
- Fast: first render of the list does not wait for the map; no layout shift.
- Footer: disclaimer "Not affiliated with IRONMAN, Challenge Family or PTO/T100. Dates
  can change; always confirm on the official website." and a "Report a correction" link.

## Delivery

- `README.md`: what it is, how to run, how to update data, how to deploy.
- `.github/workflows/deploy.yml`: on push to `main` → `npm ci`, `validate:data`,
  `test`, `build`, deploy with `actions/deploy-pages`.
- Scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `validate:data`, `typecheck`,
  `lint` (if eslint is set up).
