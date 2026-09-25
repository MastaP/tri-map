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
- Only standard distances. A race is `full` if it is ~3.8/180/42.2, `half` if
  ~1.9/90/21.1 (small course deviations are fine). Non-standard formats are excluded.
