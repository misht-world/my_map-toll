# Roadmap

The MVP is a static visualization. Every item below is a self-contained
step that builds on the architecture already in place; none requires a
rewrite of the core.

## 1. Calendar-aware filtering

- Reuse the already-parsed `Condition.when` ASTs (opening_hours).
- Store them in a per-segment sidecar JSON next to the PMTiles, sharded
  by `osm_id`, so the client can fetch only what it renders.
- Add a date picker to the web UI. Filter/recolor `conditional` features
  by "active on chosen date".
- No tile rebuild required: only sidecars + UI.

## 2. Seasonal closures as a distinct layer

- Extend the interpreter to recognize `seasonal=*`, `access:conditional`
  with seasonal scopes, and similar.
- Add a third layer ("Seasonal closures") to web + tile pipeline.
- Reuses the exact same `Condition` structure.

## 3. Place-name search (Nominatim)

- Optional, behind a config flag.
- Respect Nominatim usage policy: low-volume personal queries,
  attribution.

## 4. Routing (see `docs/ROUTING.md`)

- Implement `@mmt/routing-adapter` for the chosen engine (Valhalla).
- Host behind a small proxy.
- Add a routing panel (from/to, date picker) to the web UI.
- No changes needed in the tile pipeline.

## 5. Calendar-aware routing

- Wire the web date picker into the routing request so the engine uses
  time-dependent costing end to end.

## 6. Global coverage

- Split `europe-overlay.pmtiles` into regional PMTiles (`eu-*.pmtiles`,
  `na-*.pmtiles`, ...). Serve all from the same origin.
- MapLibre can host multiple vector sources seamlessly.
- For routing, the engine runs per region behind the same proxy.
