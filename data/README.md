# Race data contract

All race data lives in `data/races/*.json`. Each file is a **bare JSON array** of race
objects. The app loads every file in this folder at build time. `npm run validate:data`
checks every file against this contract, and CI will not deploy until it passes.

One record = one race **at one distance** at one venue. If a venue holds a full and a
half on the same weekend (e.g. Challenge Almere-Amsterdam), that is two records.

## Files

| File | Scope |
|---|---|
| `ironman-full.json` | Every IRONMAN-branded full-distance race worldwide, including the IRONMAN World Championship |
| `ironman-703-europe.json` | IRONMAN 70.3 races in Europe (incl. Turkey) |
| `ironman-703-americas.json` | IRONMAN 70.3 races in North, Central and South America and the Caribbean |
| `ironman-703-apac-mea.json` | IRONMAN 70.3 races in Asia, Oceania, the Middle East and Africa |
| `challenge.json` | Challenge Family full- and half-distance races (incl. Challenge Roth, The Championship) |
| `t100.json` | T100 World Championship Tour stops and (from 2027) T100 Challenger events |
| `independent.json` | Notable non-branded full/half races (Xtri World Tour, Outlaw, Embrunman, …) |

A World Championship goes in the file for its region/brand like any other race.

## Record shape

```jsonc
{
  "id": "ironman-frankfurt-full",           // required, unique across ALL files: <brand>-<location-slug>-<distance>, kebab-case ascii
  "name": "IRONMAN Frankfurt",              // required, official event name, no year
  "brand": "ironman",                       // required: "ironman" | "challenge" | "t100" | "independent"
  "series": "IRONMAN",                      // optional: sub-brand / series, e.g. "IRONMAN 70.3", "Xtri World Tour", "Outlaw"
  "distance": "full",                       // required: "full" (3.8/180/42.2) | "half" (1.9/90/21.1) | "t100" (2/80/18)
  "championship": "IRONMAN European Championship", // optional: only if the race is a world/regional championship
  "city": "Frankfurt am Main",              // required: host city / town as commonly named in English
  "country": "DE",                          // required: ISO 3166-1 alpha-2, uppercase
  "lat": 50.1109,                           // required: race venue (transition/finish area), >= 3 decimals
  "lng": 8.6821,                            // required
  "url": "https://www.ironman.com/races/im-frankfurt", // required: official event page, https
  "editions": [                             // required, >= 1 item, sorted by date ascending
    { "date": "2026-06-28", "status": "confirmed" },
    { "date": "2027-06-27", "status": "confirmed" }
  ],
  "swim": "river",                          // optional: "ocean" | "lake" | "river"  (sea/bay/lagoon => "ocean"; reservoir => "lake")
  "bike": "rolling",                        // optional bike course profile: "flat" | "rolling" | "hilly" | "mountainous"
  "run": "flat",                            // optional run course profile, same scale
  "course": { "swim": 3.4, "bike": 202, "run": 41 }, // optional: official km, ONLY for near-standard races (see "Brand vs series")
  "entry": "open",                          // optional, default "open": "open" | "qualification" | "ballot" (see below)
  "notes": "Hilly bike, famous Heartbreak Hill", // optional, <= 140 chars, factual, no marketing fluff
  "recurring": false,                       // optional, default true. false = do NOT project future editions beyond the listed ones (see below)
  "continuedAs": "t100-wanaka-t100",        // optional: id of the record that replaces this one (implies recurring: false)
  "sources": ["https://www.ironman.com/races/im-frankfurt"], // required, >= 1 URL that confirms the dates
  "verifiedAt": "2026-09-25"                // required: date the dates were last checked against sources
}
```

### Age-groupers first

TriMap is for **age-group athletes** choosing a race to enter. Everything describes the
age-group race:

- Only editions where age-groupers can race this distance. A pro-only weekend (e.g. a
  T100 stop with no age-group 100 km race) is not an edition; if a race has no
  age-group editions at all, leave it out.
- `date` is the age-group race day at this distance, not the pro race day.
- `entry`:
  - `"open"` (default): anyone can sign up, first come first served.
  - `"qualification"`: age-groupers need a qualifying slot (IRONMAN World
    Championship, IRONMAN 70.3 World Championship, The Championship, an age-group
    world-championship final, …).
  - `"ballot"`: entry by lottery, ballot or application (Norseman and similar).
- `bike` / `run` course profiles. For IRONMAN races, copy the official Flat / Rolling /
  Hilly label from the race page. For other races, judge from the published elevation
  gain: bike under ~800 m flat, ~800–1,600 m rolling, ~1,600–3,000 m hilly, more than
  that or mountain passes mountainous. Scale the run the same way (under ~150 m flat,
  ~150–400 m rolling, ~400–1,000 m hilly, more than that mountainous; halve the
  thresholds for half distance). Leave the field out rather than guess.

### Editions

- Include every edition dated **2026-01-01 or later** whose date is published by the
  organiser — past 2026 editions too (the app uses them to estimate when the next,
  not-yet-announced edition will happen).
- `date` is the main race day (`YYYY-MM-DD`). For multi-day festivals, the day this
  distance is raced. Optional `endDate` only if the race itself spans days.
- `status`:
  - `"confirmed"` — exact date published on an official source.
  - `"tentative"` — organiser shows a date marked TBC/provisional, or only a
    month/weekend and you picked the most likely day (say which in `notes`).
  - `"cancelled"` — edition officially cancelled.
- Do not invent future dates. If 2027 has not been announced, leave it out.
- Races that have been discontinued (no 2026 edition and no announced future edition)
  are **excluded**.

### When the app should not guess the next edition

By default, if a race has no edition on or after today, the app estimates the next one
(same month, weekday and week of the month as the last edition, e.g. the first Sunday of
March) and labels it as an estimate; it also projects next year's edition that way for
season-planning searches. That is wrong for some races,
so the record must say so:

- `"continuedAs": "<id>"`: the race will not be held again in this form, and another
  record replaces it. Examples: a 2026 Challenge half that becomes a T100 Challenger
  event in 2027, or a Challenge race taken over by IRONMAN. The target id must exist.
  The app links the two ("Continues as …" / "Formerly …").
- `"recurring": false`: do not project editions beyond the ones listed. Use it for
  one-off venues such as World Championships that rotate, for discontinued races that
  still have a 2026 edition in the file, and for known gaps ("no full in 2027, returns
  2028"). Explain which one in `notes`.

### Coordinates

The race venue (transition zone or finish line), not the country centroid or the
city-hall. Plausible to within a few km is fine. Double-check the sign of `lng` in
the Americas (negative) and of `lat` in the southern hemisphere (negative).

### Brand vs series

- `brand: "ironman"` covers both IRONMAN (`distance: "full"`, `series: "IRONMAN"`) and
  IRONMAN 70.3 (`distance: "half"`, `series: "IRONMAN 70.3"`).
- `brand: "challenge"`, `series: "Challenge Family"` (or `"Challenge Roth"` / `"The Championship"` where apt).
- `brand: "t100"`, `distance: "t100"`, all in `t100.json`:
  - `series: "T100 World Championship Tour"`: the PTO / World Triathlon T100 tour stops.
  - `series: "T100 Challenger"`: from 2027, the former Challenge Family middle-distance
    races. PTO acquired Challenge Family in 2026, and these races now run under
    Triathlon World Tour naming at 2/80/18 with the same organisers and venues. Their
    2026 half editions stay in `challenge.json` as `brand: "challenge"` with
    `continuedAs` pointing at the T100 Challenger record.
  - Challenge Family keeps its full-distance races (Challenge Roth, Almere-Amsterdam, …)
    under its own brand.
  - T50 (short course) is out of scope.
- `brand: "independent"` for everything else; put the series/organiser in `series`
  (e.g. `"Xtri World Tour"`, `"Outlaw"`) or omit it for a one-off race.
- Standard and near-standard distances. A race is `full` if it is ~3.8/180/42.2,
  `half` if ~1.9/90/21.1, `t100` if 2/80/18.
  - Small deviations (up to ~5% on a leg) need nothing extra.
  - A **near-standard** race (any leg more than ~5% off, but every leg within 25% of
    its category's standard) is included **with** a `course` object giving the
    official distances, e.g. Celtman `"course": { "swim": 3.4, "bike": 202, "run": 41 }`.
    The app shows these numbers and tags the race "Non-standard distance".
  - Anything with a leg more than 25% off the standard is out of scope; the
    validator rejects a `course` like that.

## Registration status

Whether an age-grouper can still enter a race's next edition. It lives in
`data/registration/`, **generated** by the refresh scripts (do not edit the status files
by hand), for the organisers whose entry status can be read:

| File | Source | Refreshed by |
|---|---|---|
| `ironman.json` | ironman.com: the race finder (`https://www.ironman.com/races?page=0…`), each race card's status tag; for a card tagged "Flex90 Eligible", the race's registration page (`…/races/<slug>/register`); for a race with an announced next edition but no card, the race page | `npm run refresh:ironman` (or `refresh:registration`), **by hand only** (ironman.com blocks GitHub-hosted runners; the script refuses to run in GitHub Actions), then commit and push |
| `t100.json` | The PTO entry platform (`https://front-api.registrations.protriathletes.org/edition/url/<slug>`) for the next edition and its age-group 100 km race, and t100triathlon.com (`https://t100triathlon.com/wp-json/njuko/v1/competition-price?competition_id=<id>&edition_id=<id>`) for its status | `npm run refresh:t100` (or `refresh:registration`), **daily in CI** before each deploy (the committed file is the fallback) |
| `t100-sources.json` | Hand-written: T100 race id → the platform's event slug **without the year**, e.g. `"t100-london-t100": "london-t100"`; the refresh asks for `<slug>-<year of the next edition>` (`london-t100-2027`) | Edit when a T100 World Tour stop is added |

Races from other organisers (Challenge Family, T100 Challenger events, which enter on
Active.com, independent races) have no status.

```jsonc
{
  "source": "https://www.ironman.com/races",     // required: the page or API read, https
  "checkedAt": "2026-09-26T05:12:03.000Z",       // required: ISO 8601 UTC timestamp of the refresh
  "races": {                                      // required: race id → status
    "ironman-nice-half": {
      "status": "general-sold-out",               // required, see below
      "label": "General entry: SOLD OUT · Sold Out | Special Entries Available", // required: the source's own wording
      "method": "register-page",                  // required: how the status was read, see below
      "editionDate": "2027-09-12",                // the edition the status is about: YYYY-MM-DD, or YYYY when only the year is known
      "url": "https://www.ironman.com/races/im703-nice/register", // optional: where to enter or check, https
      "opens": "2026-10-05",                      // optional: when entries open (YYYY-MM-DD), for "opening-soon"
      "checkedAt": "2026-09-20T05:00:00.000Z"     // optional: when this refresh could not read the race, the date of the kept status
    }
  }
}
```

`status` is one of:

- `"open"`: entries are open.
- `"opening-soon"`: entries are not open yet.
- `"sold-out"`: no entries left.
- `"general-sold-out"`: general entry is sold out; charity, special or travel-package
  places remain (IRONMAN "General Registration Sold Out", or a registration page that
  shows them).
- `"waitlist"`: sold out, with a waitlist to join.
- `"closed"`: entries are no longer taken (also IRONMAN "Race Weekend").

`method` says how the status was read (`ironman.json` uses the first three, `t100.json`
the last two):

- `"finder"`: the race card's tag in the ironman.com race finder ("Registration Now
  Open", "Registration Sold Out", "General Registration Sold Out", "Registration Opening
  Soon", "Registration Closed", "Race Weekend"…).
- `"register-page"`: the race's ironman.com registration page, read for every card tagged
  **"Flex90 Eligible"**. That tag only says entries opened less than 90 days ago (when
  IRONMAN's Flex90 benefits apply); general entry may be sold out already. Only the
  **visible** part of the page counts (these pages carry hidden sections for other
  states, such as a stale "OPENING SOON"): the general-entry card shows a price → `open`;
  "SOLD OUT" while a visible banner says special entries are available, or a visible
  IRONMAN Foundation / charity / package / bundle entry has a price → `general-sold-out`;
  "SOLD OUT" otherwise → `sold-out`. Anything unclear (no visible general-entry card,
  "OPENING SOON", a price in one currency and "SOLD OUT" in another, a page dated for
  another edition than the card, a page that could not be loaded) → **no status**; it
  never falls back to the card's "open".
- `"race-page"`: the status tag and date in the race page's header, read for a race with
  an announced (not estimated) next edition that has no card in the finder (IRONMAN
  Wisconsin 2027). Written only when the page's date is that next edition.
- `"organiser"`: t100triathlon.com's own status for the age-group 100 km race of the next
  edition (what its entry buttons show): `live` → open, `upcoming` → opening-soon,
  `sold_out` → sold-out, `wait_list` → waitlist.
- `"platform"`: when t100triathlon.com cannot be read (it sits behind Cloudflare, which
  may turn away GitHub-hosted runners), the entry platform's **explicit** signals only:
  edition not published or an opening date ahead → opening-soon; edition closed or
  archived, entries or race day past → closed; waiting-list mode → waitlist. The `label`
  names that signal ("Entries open 2026-10-05 · Triathlon - 100km - Individual", "Edition
  not published yet · …"), since the platform has no wording of its own. It never
  infers "sold out" from entry counts (they do not add up to the places: London 2026 had
  2397 entries reserved for 1750 places). When no signal applies (the race is on sale or
  sold out, the platform cannot say which), the race keeps its previous status if that is
  about the same edition, with its own `checkedAt`, so it still stops showing 30 days
  after it was read; otherwise it has none.

How the app uses it: a status is shown only when its `editionDate` is the race's next
edition in `data/races` (the same date ± 3 days, or the same year when only the year is
known), it was checked at most **30 days** ago, and it is not an "opening-soon" whose
`opens` date has passed (entries are open or sold out by then: the next refresh will
say); anything else is ignored. So a status about last year's edition, or a file nobody
refreshed for a month, never shows.

`npm run validate:data` checks these files too: known race ids of the file's brand
(`ironman.json` only IRONMAN races, `t100.json` only T100 races), the status values, a
`method` that belongs to the file, real dates and timestamps, `checkedAt` not in the
future, https URLs, and that `t100-sources.json` only maps T100 races. It warns (without
failing) when a file is older than 30 days, or when a status is about another edition
than the next one in `data/races` (often a sign that a new edition's date is missing from
the race file).
