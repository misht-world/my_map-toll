# Architecture

The project is a three-layer system on top of a monorepo. Each layer has a
single responsibility and one direction of dependency.

```
┌───────────────────────────────────────────────────────────────┐
│  OpenStreetMap (Geofabrik extract)                            │
└─────────────┬─────────────────────────────────────────────────┘
              │  scripts/01-fetch.sh, 02-filter.sh
              ▼
┌───────────────────────────────────────────────────────────────┐
│  Normalization (packages/tile-builder + packages/interpreter) │
│   raw OSM tags → { status, reason_code, conditions }          │
└─────────────┬─────────────────────────────────────────────────┘
              │  tippecanoe, pmtiles  (scripts/04-tile.sh)
              ▼
┌───────────────────────────────────────────────────────────────┐
│  Delivery: europe-overlay.pmtiles on GitHub Releases          │
└─────────────┬─────────────────────────────────────────────────┘
              │  static fetch via pmtiles protocol
              ▼
┌───────────────────────────────────────────────────────────────┐
│  Web (packages/web): MapLibre + OpenFreeMap basemap +         │
│                      our overlay layers                       │
└───────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Depends on | Purpose |
|---|---|---|
| `@mmt/model` | — | Types, statuses, reason codes. Zero runtime deps. |
| `@mmt/interpreter` | `model` | Pure functions: `rawTags → status + reason + conditions`. Fully unit-tested. |
| `@mmt/tile-builder` | `model`, `interpreter` | Node stream that enriches GeoJSON features before tippecanoe. |
| `@mmt/web` | `model` | MapLibre app. Types only from `model`, no build-time code. |
| `@mmt/routing-adapter` | `model` | Placeholder for future Valhalla/GraphHopper export. |

## Why this split

- **Interpreter is isolated.** Toll and chains logic is a pure function of
  OSM tags. We can add unit tests, replay historical snapshots, and reuse
  the same code for ad-hoc evaluation on the client if we ever want to.
- **Raw tags never reach tiles.** Tiles carry only `osm_id`, `status`,
  `reason_code`. The popup fetches full tags from Overpass on demand.
  Tile size stays small (expected <100 MB for all of Europe) and the data
  model stays cheap to update.
- **Basemap is not ours.** OpenFreeMap provides the background vectors
  globally for free. We build and host only the restriction overlay —
  that's what cuts the project down to a static site.
- **Routing adapter is empty but exists.** This signals the extension
  point. When routing lands, nothing in `tile-builder` or `web` needs
  to change: the adapter reads normalized segments and produces engine
  input.

## Conditional restrictions — the "grow into calendar" hook

OSM expresses time-/season-dependent restrictions via `*:conditional`
tags, e.g. `toll:conditional = yes @ (Nov 01-Apr 15)`. At build time we
split each such tag into clauses and parse the condition expression with
[opening_hours.js](https://github.com/opening-hours/opening_hours.js) into
a structured AST. The AST is retained in the source model (`Condition.when`)
but **not** embedded into vector tiles (to keep them small). Tiles simply
record `status: "conditional"`; the AST is regenerated from Overpass or
from a sidecar file when needed.

This means the next iteration — "is this restriction active today?" — is
a client-side filter over structured data, not a fresh pass of regex over
strings.

## What's intentionally NOT here

- No server. No API. No database.
- No manually-curated restriction layer. OSM is the sole source of truth.
- No routing in the MVP — just the architectural seam for it.
- No Nominatim-style text search — only coordinate parsing.
- No auto-updating CI — updates are a documented local command.
