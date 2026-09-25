# TriMap

**Find your next long-distance triathlon.** TriMap puts every IRONMAN, IRONMAN 70.3,
Challenge Family, T100 and notable independent full- and half-distance race on one
world map, searchable by **distance**, **date** and **region** in seconds.

It is a fully static site (no backend, no API keys) built for GitHub Pages.

![TriMap on desktop, light theme](docs/screenshots/desktop-light.png)

| Dark theme                                       | Mobile                                      | Race detail                                         |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------------------------- |
| ![Dark theme](docs/screenshots/desktop-dark.png) | ![Mobile list](docs/screenshots/mobile.png) | ![Race detail](docs/screenshots/desktop-detail.png) |

_Screenshots use the small fixture data set in `tests/fixtures/races`._

## Features

- **World map with brand markers.** Each brand has its own original glyph: shape, colour
  _and_ monogram, so it stays readable for colour-blind users and in greyscale
  (IRONMAN: red circle "IM", Challenge: blue rounded square "C", T100: violet hexagon
  "T", Independent: amber diamond with a spark). Full-distance races get an outer ring,
  races whose date is only estimated are drawn hollow with a dashed outline, and
  clusters are donuts showing the brand mix. A km tag appears when you zoom in.
- **Filters that combine:** free-text search (accent- and case-insensitive, press `/`),
  distance (Full 3.8/180/42.2, Half 1.9/90/21.1, T100 2/80/18), brand (chips and the
  map legend share one state), region, and a **month histogram** you can click or drag
  across, with presets (3 months, 6 months, rest of this year, next year).
- **Estimated dates.** When the next edition is not announced yet, TriMap estimates it
  from the last one (+52 weeks, same weekday) and labels it "≈ Jul 2027 · date TBA".
  You can hide those.
- **Only in map area**, a **shortlist** (stars, stored in your browser), sort by date
  or name, sticky month headers, and an empty state that tells you which filter to relax.
- **Shareable URLs.** Every filter and the open race live in the query string
  (`?dist=full&region=europe&when=6m&race=challenge-roth-full`).
- **Race detail** with swim/bike/run, championship, countdown, all known editions,
  venue, notes, sources, **Add to calendar** (.ics, all-day), copy link, and a
  "Report a correction" link that pre-fills a GitHub issue.
- Light/dark/system theme (the basemap follows), keyboard navigation, visible focus,
  `prefers-reduced-motion`, WCAG AA contrast (checked with axe in the e2e suite).

## Quick start

Requires Node 22+.

```bash
npm ci
npm run dev             # http://localhost:5173 with the real data in data/races
npm run dev:fixtures    # same, with the 16-race fixture set (tests/fixtures/races)
```

## Scripts

| Script                                  | What it does                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev` / `dev:fixtures`          | Vite dev server with real / fixture data                                           |
| `npm run build`                         | Production build into `dist/` (fails on invalid race data)                         |
| `npm run build:fixtures`                | Build with fixture data into `dist-fixtures/` (used by e2e)                        |
| `npm run preview`                       | Serve `dist/` locally                                                              |
| `npm run validate:data`                 | Validate `data/races/*.json` and print a summary; `-- --fixtures` for the fixtures |
| `npm test`                              | Unit tests (Vitest)                                                                |
| `npm run test:e2e`                      | Playwright smoke + accessibility tests against a fixture build                     |
| `npm run screenshots`                   | Regenerate `docs/screenshots/*.png`                                                |
| `npm run typecheck` / `lint` / `format` | TypeScript, ESLint, Prettier                                                       |

For the e2e tests install Chromium once with `npx playwright install chromium` (on a bare
Linux box also `npx playwright install-deps chromium`).

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
  "sources": ["https://www.ironman.com/races/im-frankfurt"],
  "verifiedAt": "2026-09-25"
}
```

### Updating data

1. Edit the right file in `data/races/`: add a new edition to `editions` (keep them
   sorted), mark cancellations with `"status": "cancelled"`, and bump `verifiedAt`.
2. Run `npm run validate:data`. It checks the schema, unique ids across files, the id
   format (`<brand>-<location>-<distance>`), sorted editions, known country codes,
   coordinates inside the country's region (catches flipped signs), https URLs, and
   prints counts per brand × distance × region. Errors exit non-zero; warnings (for
   example "next date is estimated") do not.
3. Open a pull request. CI runs the same checks, and the production build refuses
   invalid data too, so a broken file cannot be deployed.

Countries and regions are defined in `src/data/regions.ts`; add a country there if the
validator reports an unknown code.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs `npm ci`, `validate:data`,
   `typecheck`, `test`, `build`, and deploys `dist/` with `actions/deploy-pages`.

The build uses `base: './'`, so it works under any Pages sub-path
(`https://<user>.github.io/<repo>/`). The GitHub link in the header and the "Report a
correction" links are derived from the repository automatically in Actions; set
`VITE_REPO_URL` to override it (for example for a local build).

Pull requests run `.github/workflows/ci.yml` (checks, build and the e2e suite) without
deploying.

## How it is built

- Vite + React 19 + TypeScript (strict), Tailwind CSS v4, self-hosted fonts (Barlow
  Condensed for display, Inter for UI).
- `maplibre-gl` used directly and lazy-loaded, so the results list renders before the
  map arrives. Basemaps: CARTO Positron / Dark Matter (keyless). If the basemap cannot
  load, the map falls back to a plain background and still shows every race.
- Races are a clustered GeoJSON source; clusters and races are HTML markers synced from
  the source, so they can use SVG glyphs and donuts.
- Data is bundled at build time with `import.meta.glob`, validated with zod, and
  enriched with region, country and the next edition (`src/data/nextEdition.ts`).
- Flags are SVGs from [`flag-icons`](https://github.com/lipis/flag-icons) because
  Windows does not render flag emoji.

```
src/
  data/        schema (zod), regions, brands + glyphs, next-edition logic, loader, validator
  lib/         filters, URL state, dates, geo, .ics, search
  components/  header, filters, time histogram, results list, race detail, sheets
  map/         MapView (lazy), marker builders, legend
scripts/       validate-data.ts
tests/         unit tests + fixture races
e2e/           Playwright smoke, accessibility and screenshot specs
```

## Disclaimer

TriMap is not affiliated with IRONMAN, Challenge Family or PTO/T100. Brand glyphs are
original monograms, not the organisers' logos. Dates can change; always confirm on the
official website.
