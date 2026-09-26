# TriMap

**Find your next long-distance triathlon to enter.** TriMap is built for age-group
athletes choosing their next race, not for following pro racing. It puts every IRONMAN,
IRONMAN 70.3, Challenge Family, T100 and notable independent full- and half-distance race
that age-groupers can race on one world map, searchable in seconds by **distance**,
**date**, **region**, **how you get a start** and **how hilly the course is**.

**Live: <https://mastap.github.io/tri-map/>**

It is a fully static site (no backend, no API keys) built for GitHub Pages. Race dates
come from organisers' official sources; registration status (sold out, opens soon, …)
is refreshed daily for T100 and by hand for IRONMAN (see
[Keeping the data fresh](#keeping-the-data-fresh)).

![TriMap on desktop, light theme](docs/screenshots/desktop-light.png)

| Dark theme                                       | Mobile                                      | Race detail                                         |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------------------------- |
| ![Dark theme](docs/screenshots/desktop-dark.png) | ![Mobile list](docs/screenshots/mobile.png) | ![Race detail](docs/screenshots/desktop-detail.png) |

_These four screenshots show the real race data and registration status (26 September
2026). `npm run screenshots` regenerates every image in `docs/screenshots` from the small
fixture set in `tests/fixtures/races` instead, so recapture these four from a real-data
build (`npm run build && npm run preview`) when the UI changes._

## Features

- **World map with brand markers.** Each brand has its own original glyph: shape, colour
  _and_ monogram, so it stays readable for colour-blind users and in greyscale
  (IRONMAN: red circle "IM", Challenge: blue rounded square "C", T100: teal hexagon
  "T", Independent: amber diamond with a spark). Full-distance races get an outer ring,
  races whose date is only estimated (when estimated dates are on) are drawn hollow with
  a dashed outline,
  qualifier-only and ballot races carry a small lock / ticket pip, a few races close
  together fan out their own glyphs and bigger clusters are donuts showing the brand
  mix. A FULL / HALF / T100 tag, like the card badge, appears when you zoom in.
- **The filters you need first stay in view.** Search, distance and date presets sit
  above the results; region, course, entry options and brand open under **Filters**,
  and while it is closed the filters set there show as removable chips.
- **Filters that combine:** free-text search (accent- and case-insensitive, word starts,
  common country names such as "USA" or "UK", a year such as "roth 2027"; press `/`),
  distance (Full 3.8/180/42.2, Half 1.9/90/21.1, T100 2/80/18), brand (chips and the
  map legend share one state), region, and a **month histogram** you can click or drag
  across, with presets (3, 6 and 12 months, rest of this year, next year).
- **Planning next season works.** A date range matches a race when any upcoming
  edition with an announced date falls in it, so "2027" also finds races whose next
  edition is in late 2026; the card shows the 2027 date with "(next: Dec 2026)". With
  **Estimated dates** on, projected editions count too, and the list says how many
  races usually held in that period have no date announced yet.
- **Can I just sign up?** Races that need a qualifying slot carry a "Qualifier only"
  badge, lottery/application races a "Ballot" badge (on cards, in the detail and in the
  map tooltip). **Open entry only** hides both.
- **Can I still enter?** IRONMAN, IRONMAN 70.3 and T100 World Tour races show whether
  their next edition is sold out ("Sold out", "Waitlist"), partly sold out ("General entry
  sold out": charity or travel-package places may remain), closed or not open yet ("Opens
  soon"), always with the date it was checked ("as of 26 Sep"); the detail explains it in
  a Registration row. **Hide sold out** (`hidesold=1`) drops sold-out and closed races. A
  status older than 30 days, about another edition, or "Opens soon" past its opening date
  is not shown; races from other organisers have none.
- **Course profile.** Bike and run courses are rated Flat / Rolling / Hilly /
  Mountainous and shown with a small elevation silhouette and the word. The **Course**
  filter picks profiles per discipline; races without course data are left out while
  it is active, and the list says how many that hid and can list them.
- **Nearest first.** Sort by distance from your location (asked for only when you pick
  "Nearest"), or from the map centre (marked on the map) if you don't share it; cards
  then show "1,240 km away".
- **Countdown in weeks** up to a year out ("in 23 weeks"), because training plans are
  counted in weeks. Races in the next three weeks, usually too late to enter and train
  for, start folded away.
- **Races that change hands.** When a race continues under another name (for example a
  Challenge half that becomes a T100 Challenger event), its page says "Continues as …
  from 2027" and the new race says "Formerly …"; searching the old name finds the new
  race. Races with no future edition are not listed, but links to them still open with
  a clear "No future edition announced".
- **Age-grouper emphasis.** A championship title is prominent only when you have to
  qualify for it; regional titles and pro tour finals held alongside an open race are a
  quiet secondary tag. T100 races read "T100 · 100 km"; cards name what you enter
  ("T100", "T100 Challenger") and the detail names the series.
- **Only announced dates by default.** Every date shown by default comes from an
  official source. A race whose next date is not announced yet is left out of the
  list, map and counts (the list says how many), and its page says "Next date not
  announced yet · last held …". Turn on **Estimated dates** (`?est=1`) to see an
  estimate from the last edition (same month, weekday and week of the month), labelled
  "≈ Jul 2027 · date TBA".
- **Near-standard distances.** A race held over official distances more than 5% off
  its category's standard on some leg (Celtman: 3.4 / 202 / 41 km) shows those numbers
  and a "Non-standard distance" tag on the card, in the detail and in the map tooltip.
  The distance filter still works by category.
- **Only in map area**, a **shortlist** (stars, stored in your browser; shortlisted
  cards spell out swim, bike and run for comparing), sort by date or name, sticky month
  headers, and an empty state that tells you which filter to relax.
- **Shareable URLs.** Every filter, the sort and the open race live in the query string
  (`?dist=full&region=europe&when=6m&open=1&bike=flat,rolling&sort=near&race=challenge-roth-full`),
  including the map area of an "In map area" search (`bbox=west,south,east,north`), so
  a link made on a desktop shows the same races on a phone. A race's "Copy link" points
  at a small page per race whose preview names the race in chat apps.
- **Race detail** with swim/bike/run distances, swim type and bike/run profiles, how to
  enter, championship, countdown, all known editions, venue, notes, sources, **Add to
  calendar** (.ics, all-day), copy link, and a "Report a correction" link that
  pre-fills a GitHub issue.
- **Works without the map.** If the map cannot load (no WebGL 2, a failed download),
  the list, filters and race details keep working.
- Light/dark/system theme (the basemap follows), keyboard navigation with a skip link,
  visible focus, `prefers-reduced-motion`, WCAG AA contrast (checked with axe in the
  e2e suite), 44px touch targets on touch screens (phones and tablets).

## Quick start

Requires Node 22+.

```bash
npm ci
npm run dev             # http://localhost:5173 with the real data in data/races
npm run dev:fixtures    # same, with the 19-race fixture set (tests/fixtures/races)
```

## Scripts

| Script                                  | What it does                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev` / `dev:fixtures`          | Vite dev server with real / fixture data                                           |
| `npm run build`                         | Production build into `dist/` (fails on invalid race data)                         |
| `npm run build:fixtures`                | Build with fixture data into `dist-fixtures/` (used by e2e)                        |
| `npm run preview`                       | Serve `dist/` locally                                                              |
| `npm run validate:data`                 | Validate `data/races/*.json` and print a summary; `-- --fixtures` for the fixtures |
| `npm run refresh:ironman`               | Refresh the IRONMAN registration status (by hand, see below)                       |
| `npm run refresh:t100`                  | Refresh the T100 registration status (CI does it before every deploy)              |
| `npm run refresh:registration`          | Both refreshes, IRONMAN then T100 (by hand; never in CI)                           |
| `npm test`                              | Unit tests (Vitest)                                                                |
| `npm run test:e2e`                      | Playwright smoke + accessibility tests against a fixture build                     |
| `npm run screenshots`                   | Regenerate `docs/screenshots/*.png`                                                |
| `npm run typecheck` / `lint` / `format` | TypeScript, ESLint, Prettier                                                       |

For the e2e tests install Chromium once with `npx playwright install chromium` (on a bare
Linux box also `npx playwright install-deps chromium`).

## Keeping the data fresh

| What                                            | How                                                                                                                             | When                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| T100 registration status                        | Automatic: the deploy workflow runs `npm run refresh:t100` before every build                                                   | Daily, 05:00 UTC                                                        |
| **IRONMAN registration status**                 | **By hand:** `npm run refresh:registration`, check the summary, commit, push ([below](#refreshing-registration-status-by-hand)) | Every 1–2 weeks. A status older than 30 days is no longer shown         |
| Per-race share pages and their "next date" text | Automatic: rebuilt by the daily deploy                                                                                          | Daily                                                                   |
| Race dates, new editions, new or dropped races  | By hand: edit `data/races/*.json`, `npm run validate:data`, commit ([Updating data](#updating-data))                            | When organisers announce; most next-season dates appear October–January |

### Refreshing registration status by hand

ironman.com blocks GitHub's servers, so the IRONMAN status has to be fetched from your
own machine (the script refuses to run in GitHub Actions). `refresh:registration` does
IRONMAN, then T100:

```bash
git pull
npm run refresh:registration -- --dry-run   # optional: fetch and print the summary, write nothing
npm run refresh:registration                # takes about 3–8 minutes
git diff --stat data/registration/
git add data/registration/
git commit -m "Refresh registration status"
git push                                    # the deploy publishes it a few minutes later
```

Before committing, read the summary it prints:

- **"… TriMap races with a status: … open, … sold-out, …"**: compare with the previous
  run (`git diff data/registration/ironman.json`). A large drop usually means
  ironman.com rate-limited the run part-way ("too many requests"). Races whose
  registration page could not be read get no status rather than a guess, so run it again
  later instead of committing.
- **"cards with no race in data/races"**: a new IRONMAN race (or a changed URL). Add it
  to `data/races` (see [Updating data](#updating-data)) and refresh again.
- **"cards with a tag this script does not know"**: ironman.com introduced a new label.
  Map it in `IRONMAN_LABELS` in `scripts/registration/ironman.ts`.
- **"listed IRONMAN races with no card and no status"**: normal for races held recently
  whose next edition is not on sale yet.

If a refresh fails, the file for that source is left unchanged. `refresh:registration`
still runs the other source, which may write its file, and then exits with an error. The
last line shows which one failed (`IRONMAN: ok · T100: FAILED`). Check `git status`, then
commit the file that refreshed or discard it with
`git restore data/registration/<file>`. For IRONMAN, the usual causes are:

- a block page or HTTP error from ironman.com: wait and retry;
- fewer than half of the races matched: usually the site's markup changed. Fix the
  parser in `scripts/registration/` against fresh pages; its tests use saved pages in
  `tests/fixtures/registration/`.

`npm run refresh:ironman` and `npm run refresh:t100` refresh one source each. Running the
T100 refresh by hand is optional: CI does it before every deploy, and the committed
`t100.json` is only its fallback.

## Race data

All races live in `data/races/*.json`, one file per brand/region (see
[`data/README.md`](data/README.md) for the full contract). One record is one race at one
distance at one venue:

```json
{
  "id": "ironman-frankfurt-full",
  "name": "IRONMAN Frankfurt",
  "brand": "ironman",
  "series": "IRONMAN",
  "distance": "full",
  "championship": "IRONMAN European Championship",
  "city": "Frankfurt am Main",
  "country": "DE",
  "lat": 50.1109,
  "lng": 8.6821,
  "url": "https://www.ironman.com/races/im-frankfurt",
  "editions": [{ "date": "2027-06-27", "status": "confirmed" }],
  "swim": "lake",
  "bike": "rolling",
  "run": "flat",
  "entry": "open",
  "sources": ["https://www.ironman.com/races/im-frankfurt"],
  "verifiedAt": "2026-09-25"
}
```

Everything describes the **age-group** race: its date, its entry (`open`,
`qualification` or `ballot`) and its course. `recurring: false` and `continuedAs` tell
the app not to guess a next edition for one-off or replaced races.

### Updating data

1. Edit the right file in `data/races/`:
   - a new date: add an edition to `editions` (keep them sorted by date);
   - a cancellation: set that edition's `"status": "cancelled"`;
   - a race that ends or is replaced: set `"recurring": false` or
     `"continuedAs": "<id of the new race>"`;
   - a new race: add a record following [`data/README.md`](data/README.md). Use the
     id format `<brand>-<location>-<distance>`, the venue's coordinates, the official
     `url` and at least one source.

   For IRONMAN races, the next registration refresh finds the new race by its `url`.
   Bump `verifiedAt` on every record you checked.

2. Run `npm run validate:data`. It checks:
   - the schema;
   - ids that are unique across files and follow the format;
   - sorted editions;
   - known country codes;
   - coordinates inside the country's region, which catches flipped signs;
   - https URLs.

   It also prints counts per brand × distance × region. Errors exit non-zero. Warnings
   don't: for example "next date is estimated", or a missing bike / run course profile,
   which hides the race from course searches.

3. Commit and push to `main`, or open a pull request to get the e2e suite too. The deploy
   runs the same checks, and the production build refuses invalid data, so a broken
   file cannot be deployed.

Countries and regions are defined in `src/data/regions.ts`; add a country there if the
validator reports an unknown code.

## Registration status

Whether a race can still be entered lives in `data/registration/`: `ironman.json`,
`t100.json` and `t100-sources.json`. The first two are generated by the refresh scripts;
do not edit them by hand. The file format and each status's exact meaning are in
[`data/README.md`](data/README.md#registration-status).

**Coverage.** IRONMAN and IRONMAN 70.3 races, and the T100 World Championship Tour
stops. Challenge Family, independent races and T100 Challenger events (which take
entries on Active.com) show no status.

**What the app shows.** A status appears only when it is about the race's next edition,
is at most 30 days old, and, for "Opens soon", its opening date has not passed. Every
badge carries the date it was checked ("as of 26 Sep").

**How IRONMAN statuses are read** (`scripts/registration/ironman.ts`)

- The ironman.com race finder (about 23 pages) shows a registration tag on every race
  card. The script matches each card to `data/races` by the race's `url`.
- Cards tagged "Flex90 Eligible" only say that entries opened less than 90 days ago, not
  whether places are left. For those, the script reads the race's `/register` page and
  uses what its visible general-entry card shows:
  - a price means open;
  - "SOLD OUT" with charity or special entries still on sale means general entry sold
    out;
  - "SOLD OUT" otherwise means sold out;
  - anything unclear means no status.
- For a race with an announced next edition but no card, it reads the race page's tag.
- Requests go one at a time, 2 s apart, with an honest `TriMap/1.0` User-Agent. After
  "too many requests" it waits as long as the site asks (within limits); if still
  refused, it requests no more race or registration pages.
- It writes nothing if the finder returns an error or block page, or if fewer than half
  of the listed IRONMAN races get a status.

**How T100 statuses are read** (`scripts/registration/t100.ts`)

- `t100-sources.json` maps each World Tour race to its entry-platform slug (without the
  year). Add new World Tour stops there.
- The PTO entry platform gives the next edition and its age-group 100 km race;
  t100triathlon.com gives that race's status (open, opening soon, waiting list, sold
  out).
- If t100triathlon.com cannot be read, only the platform's explicit signals count: not
  published yet, closed, waiting list. "Sold out" is never inferred from entry counts,
  which include entries the place limit does not count. A race that is on sale keeps its
  previous status for the same edition until that ages out.
- In CI the step has hard limits: no new request after 3 minutes, a capped wait after
  "too many requests", a 5-minute step timeout. It can never fail the deploy; if it
  fails, the build uses the committed `t100.json`. CI does not commit what it fetched.

## Deploying to GitHub Pages

The site is deployed from `main` of
[MastaP/tri-map](https://github.com/MastaP/tri-map) to
<https://mastap.github.io/tri-map/>. Every push to `main` deploys.

To set up a fork:

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs `npm ci`, `refresh:t100`,
   `validate:data`, `typecheck`, `test`, `build`, and deploys `dist/` with
   `actions/deploy-pages`.

The workflow also runs every day at 05:00 UTC. That run refreshes the T100 registration
status before building. It also rewrites the per-race share pages (`race/<id>/`) and
their "next date" text, which are produced at build time, so they stay current between
pushes. GitHub pauses scheduled workflows in a repository with no activity for 60 days;
if that happens, re-enable the workflow under **Actions**.

The build uses `base: './'`, so it works under any Pages sub-path
(`https://<user>.github.io/<repo>/`). The GitHub link in the header and the "Report a
correction" links are derived from the repository automatically in Actions; set
`VITE_REPO_URL` to override it (for example for a local build). Share previews need the
site's absolute URL: it defaults to the repository's GitHub Pages URL; set
`VITE_SITE_URL` for a custom domain.

Pull requests run `.github/workflows/ci.yml` (checks, build and the e2e suite) without
deploying.

### Analytics

`index.html` loads Google Analytics 4 (`G-JNRXNEP8TM`), but only when the page is served
from `mastap.github.io`, so local dev servers, previews, e2e runs and forks send nothing.

- **What GA receives:** page views, including the query string (filters, open race, and
  the search-box text in `q`), plus GA's standard device and approximate-location data.
- **What never reaches it:** the viewer's location for "Nearest" sort stays in the
  browser and never enters the URL, and the shortlist stays in `localStorage`.
- **No consent banner:** there isn't one yet. EU visitors normally need to consent to
  GA's `_ga` cookie.

## How it is built

- Vite + React 19 + TypeScript (strict), Tailwind CSS v4, self-hosted fonts (Barlow
  Condensed for display, Inter for UI).
- `maplibre-gl` used directly and lazy-loaded, so the results list renders before the
  map arrives (on phones only when the map is needed). Basemaps: CARTO Positron / Dark
  Matter (keyless). If a basemap style cannot load (also on a theme switch), the map
  falls back to a plain background and still shows every race.
- Races are a clustered GeoJSON source; clusters and races are HTML markers synced from
  the source, so they can use SVG glyphs and donuts.
- Data is read and validated with zod at build time (the `virtual:trimap-races`
  module in `vite.config.ts`), so the browser gets validated records and no schema
  library, and is enriched at runtime with region, country and the upcoming editions
  (`src/data/derive.ts`, `src/data/nextEdition.ts`). The registration status files come
  the same way (`virtual:trimap-registration`) and are attached to each race's next
  edition when fresh (`src/data/registration.ts`); the refresh scripts live in
  `scripts/registration/`.
- The build also writes `race/<id>/index.html` for every race (share previews, see
  `scripts/racePages.ts`) and injects absolute `og:image` / `og:url` / canonical tags
  when the site URL is known (`VITE_SITE_URL`, else the GitHub Pages URL of the repo).
  `public/og-image.png` and the app icons are static files.
- Flags are SVGs from [`flag-icons`](https://github.com/lipis/flag-icons) because
  Windows does not render flag emoji; the heaviest ones (coats of arms) are small PNGs
  in `src/assets/flags`.

```
src/
  data/        schema (zod), derivation, regions, brands + glyphs, next-edition logic, loader, validator
  lib/         filters, URL state, dates, geo, .ics, search
  components/  header, filters, time histogram, results list, race detail, sheets
  map/         MapView (lazy), marker builders, legend
scripts/       validate-data.ts, racePages.ts (per-race share pages), refresh-{ironman,t100,registration}.ts (registration status)
tests/         unit tests + fixture races
e2e/           Playwright smoke, accessibility and screenshot specs
```

## Disclaimer

TriMap is not affiliated with IRONMAN, Challenge Family or PTO/T100. Brand glyphs are
original monograms, not the organisers' logos. Dates can change; always confirm on the
official website.
