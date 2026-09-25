# TriMap: product and technical spec

A fast, good-looking, static search portal for long-distance triathlons. A triathlete
should find a suitable race by **distance**, **time** and **region** within seconds,
across every major brand, on a world map where each brand is recognisable at a glance.

**Audience: age-group athletes first.** TriMap helps an age-grouper choose a race to
enter, not follow pro racing. Dates, entry rules and courses describe the age-group race
(see `data/README.md`); the UI leads with what matters for picking and training for a
race (can I enter, when, where, how hilly) and keeps pro-only concepts in the background.

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
  circle "IM", Challenge blue rounded-square "C", T100 teal hexagon "T", Independent
  amber diamond "★"/"I". Pick a palette that works on light and dark basemaps.
- `src/data/loadRaces.ts`: the race records come from a build-time virtual module
  (`virtual:trimap-races`, see `vite.config.ts`) that reads `data/races/*.json` and
  validates it with zod in Node, so the browser ships no schema library. At runtime
  `src/data/derive.ts` adds per race: `region`, `countryName`, `flag`, `upcoming`,
  `nextEdition`.
- **Next edition logic** (pure, unit-tested, `today` injected):
  first edition with `date >= today` (or still running) and status ≠ cancelled. If
  none, estimate one from the latest non-cancelled edition, keeping its month, weekday
  and week of the month (the 1st Sunday of March 2026 → the 1st Sunday of March 2027),
  year by year until it is ≥ today, flagged `estimated: true`. (52-week steps would
  drift a race held on the 1st into the previous month.) `upcoming` lists every edition
  still to come: the known ones, then such yearly estimates up to the end of next year. The UI shows estimated dates distinctly
  ("≈ Jun 2027 · date TBA") and they can be toggled off. No estimate (next edition
  `null`) for races marked `recurring: false` or `continuedAs`, or whose editions are
  all cancelled.
- **Listed races**: only races with a next edition appear in results, counts, the
  histogram and the map. The others (replaced, one-off, all cancelled) still open from
  a `?race=` link.
- Derived at load: `entry` defaults to `"open"`; `formerly` is the reverse index of
  `continuedAs` (which races this one replaces), and former names are added to the
  search text so the old name finds the new race.
- `scripts/validate-data.ts` (`npm run validate:data`): zod-validate every file, unique
  ids across files, id format, editions sorted, known country code, lat/lng inside a
  coarse bounding box for the country's region, https urls, prints a summary table
  (counts per brand × distance × region, count with no upcoming confirmed date).
  Non-zero exit on any error. Warnings (e.g. no edition after today) do not fail.

## UX

Layout (≥ 768px, tablets included): left column (360–448px) with search, filters and
results; map fills the rest. Search, the distance tiles and the date presets are always
in view; region, course, entry options and brand sit behind a "Filters" button (closed
by default, remembered), and filters set there show as removable chips while it is
closed, so at least three results are visible on a 1280 × 720 screen. Mobile: map/list
toggle, filters in a bottom sheet sized to its content, results as a scrollable list;
touch targets are 44px on coarse pointers. The map loads on demand on phones (first
"Map" tap, "In map area" or "Nearest" without location) and is optional everywhere: if
its code fails to load or the browser has no WebGL 2, the list, filters and details
keep working and the map area says so.

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
  data, and at least to December of next year; bar height = races held that month
  matching the *other* filters; click or drag to select a month range (the selection
  stays in the heading, hovering shows a tooltip). Preset chips: Next 3 / 6 / 12 months,
  rest of this year, next year (none pressed = any time). A race matches a range when
  **any** upcoming edition, known or estimated, falls in it, and it is then listed and
  shown with that edition ("≈ Oct 2027 (next: Oct 2026)"), so planning next season
  finds races whose next edition is still this year. A range from an old link that has
  passed is dropped with a notice. A 4-digit year in the search ("roth 2027") works the
  same way.
- **Course**: bike and run profile (Flat, Rolling, Hilly, Mountainous, drawn as small
  elevation silhouettes) as a 2 × 4 matrix of toggles, OR within a discipline, AND
  between them. Selecting every profile still means "has course info". While active,
  races without that profile are excluded; the UI says how many were hidden and can
  list them in a "Course not listed yet" group.
- **Open entry only** toggle: hides `qualification` and `ballot` races.
- **Announced dates only** toggle (default off): hides estimated editions. Every
  on/off switch is off by default and narrows the results when on.
- **Only in map area** toggle: restrict results to the current map viewport.
- **Shortlist**: star races (localStorage); a "Shortlist only" toggle. While it is on,
  cards spell out swim, bike and run to compare, and starred races hidden by other
  filters are called out with "Show all starred".
- Result count, a "Clear filters" action and "Share this search" (copies the URL).
  Empty state with a helpful suggestion. With only "Half" selected, a note offers the
  T100 (100 km) races, many of them former Challenge halves.

### Results list

Sorted by date (alternatives: name, **Nearest**). Date order is grouped under sticky
month headers; races in the next three weeks, usually too late to enter and train for,
start folded in a "Next 3 weeks" group (not while searching or on the shortlist). Each
card: brand marker + series (a T100 World Championship Tour stop reads "T100": the card
names what an age-grouper enters, the detail names the tour), distance badge ("Full",
"Half", "T100 · 100 km"), name, entry badge ("Qualifier only" / "Ballot"; none for open
entry), date (weekday + date; estimated dates styled differently), countdown in weeks up
to a year out ("in 23 weeks", training plans count weeks), city + country flag, star. A
compact bike-profile hint (bike icon, elevation silhouette and the word) is shown only
when the badge row is otherwise simple. A championship title is a prominent badge only
when entry is by qualification (it means "qualify first"); every other title (regional
championships, a pro tour final held alongside an open race) is a quiet secondary tag.
The first ~30 cards render first and the rest when the browser is idle. Hover
highlights the map marker; click selects.

**Nearest** sorts by great-circle distance from the viewer's location, requested with
`navigator.geolocation` only when the user picks it (a shared `?sort=near` link does
not prompt); if location is denied or unavailable, from the map centre (marked on the
map), with a note saying which and a button to try location again. Cards then show
"1,240 km away". With a location, the map shows it and the nearest races.

### Map

- GeoJSON source of the filtered races, clustered with a small radius (34px) so single
  brand glyphs take over from country zoom. Clusters of 2–3 races are a fan of their
  brand glyphs; bigger ones are SVG donuts (with clear gaps between brand arcs) and the
  count in the middle. With world copies, a cluster is drawn once.
- Single races are HTML markers in the brand's shape/colour/monogram; full distance has
  an outer ring, and from zoom 6 a FULL / HALF / T100 tag like the card badge.
  Estimated-date races use a dashed outline (tinted in the dark theme). Qualifier-only
  and ballot races carry a lock / ticket pip. Markers and their tooltips show the same
  edition as the card (the one inside the date filter).
- Click a cluster → zoom to expansion; if the cluster cannot expand (co-located races),
  open a popup listing its races with their entry badge.
- Hover/select sync with the list: hovering a card whose race is inside a cluster pops
  its glyph up above the cluster; selecting a race flies to it and zooms until it has
  its own marker. The map follows a search and the region filter.
- Legend (brands) doubling as brand filter, collapsed to a pill by default.
  Fit-to-results button. Attribution visible.
- On a phone-sized map, the first view shows the viewer's region (guessed from the time
  zone, no prompt) instead of a clipped world.

### Race detail

Opens in the sidebar (bottom sheet on mobile) when a race is selected; deep-linkable via
`?race=<id>`. The mobile sheet has two heights, a peek that keeps the map pin in view
(opened from the map) and nearly full (opened from the list); drag or tap its handle to
switch, drag down from the peek to close. The tab title names the open race. Shows: name, brand/series, distance badge, entry badge, championship, next
date + countdown, all known editions (past ones greyed), location + flag, a course grid
(swim / bike / run km with swim type and bike / run profile, "Not listed yet" when
unknown), how to enter in plain words, notes, buttons: Official website, Add to
calendar (.ics download, all-day event), Copy link, Star. Sources and "verified at" in
small print. Esc closes. "Also here" lists other races at the venue by short name, entry
badge and date. "Copy link" copies the race's own page (`race/<id>/`, generated at
build time) whose title and preview tags name the race, so a shared link unfurls
properly in chat apps; it forwards to `?race=<id>`.

- `continuedAs`: "Continues as <name> from <year>" links to the successor; the
  successor shows "Formerly <name>" linking back.
- No next edition: "No future edition announced", when it was last held, and the
  successor link if there is one.

### URL

`?q=&dist=&brand=&region=&when=3m|6m|12m|year|next-year|from=&to=&open=1&bike=&run=&est=0&area=1&at=lat,lng,zoom&star=1&sort=name|near&race=`.
Defaults are omitted; unknown values are ignored. `at` is written only with `area=1`, so
a shared "In map area" search shows the same races.

### Quality bar

- Looks polished: deliberate typography (a sporty display face for headings + a clean
  UI face), consistent spacing, subtle motion, light and dark themes.
- Accessible: keyboard navigable (a "Skip to results" link first; nothing hidden is
  focusable), visible focus, one h1 and a heading outline, landmarks (search, main,
  the map region), aria labels that contain the visible text, one polite live region
  for the result count (inside the filter sheet while it is open), brand identity not
  by colour alone (colours also checked under simulated colour blindness), respects
  `prefers-reduced-motion`, contrast AA.
- Fast: a static shell paints before the JavaScript; the list does not wait for the
  map; the two first-screen fonts are preloaded; flags load lazily (heavy ones are
  small PNGs); no layout shift.
- Shareable: Open Graph / Twitter tags with a preview image, a per-race page for each
  race link, a web manifest and touch icons, a 404 page.
- Footer: disclaimer "Not affiliated with IRONMAN, Challenge Family or PTO/T100. Dates
  can change; always confirm on the official website." and a "Report a correction" link.

## Delivery

- `README.md`: what it is, how to run, how to update data, how to deploy.
- `.github/workflows/deploy.yml`: on push to `main` → `npm ci`, `validate:data`,
  `test`, `build`, deploy with `actions/deploy-pages`.
- Scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `validate:data`, `typecheck`,
  `lint` (if eslint is set up).
