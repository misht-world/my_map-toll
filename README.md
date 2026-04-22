# my_map-toll

A free, static web map of European road restrictions — **toll roads for
passenger cars** and **snow-chain requirements** — built entirely from
OpenStreetMap. No server, no database, no manually curated data.
https://misht-world.github.io/my_map-toll/

- Basemap: [OpenFreeMap](https://openfreemap.org/) (free, keyless).
- Overlay: our own PMTiles, built from a Geofabrik OSM extract.
- Frontend: TypeScript + Vite + MapLibre GL.

## What works today

- Interactive map of Europe with two toggleable layers: **Toll (cars)** and **Snow chains**.
- Per-feature popup: normalized status + reason code + lazy-loaded raw
  OSM tags (via Overpass) + link to openstreetmap.org.
- Coordinate search (`lat, lon` or `lon, lat`, several separators).
- URL state (`#map=zoom/lat/lon&layers=…`) and "copy shareable link" button.
- Cursor-coordinate readout; right-click to copy coordinates to clipboard.
- OpenStreetMap / ODbL attribution always visible.

## Status glossary

| Status | Meaning |
|---|---|
| **Explicit** | OSM explicitly states the restriction applies. |
| **Conditional** | Restriction applies only under a time/date rule recorded in OSM. Today we flag it; seasonal activation is on the roadmap. |
| **Ambiguous** | OSM implies a restriction but doesn't fully specify it (e.g. `winter_road=yes`). Kept, not hidden, so you can investigate. |

Full rule set: [`docs/TAG_INTERPRETATION.md`](docs/TAG_INTERPRETATION.md).

## Data sources

| Input | Used for |
|---|---|
| [Geofabrik](https://download.geofabrik.de/europe-latest.osm.pbf) Europe extract | Overlay tile build. |
| [Overpass API](https://overpass-api.de/) | Lazy fetch of raw OSM tags on popup click. |
| [OpenFreeMap](https://openfreemap.org/) | Basemap vector tiles. |

All end-user data derives from © OpenStreetMap contributors under the ODbL.

## Run locally

```bash
# 1. Install deps
npm install

# 2. Run tests (interpreter)
npm test

# 3. Start the dev server (uses the PMTiles URL from .env or a placeholder)
npm run dev
```

Open http://localhost:5173.

By default the web app looks for the overlay PMTiles at
`https://github.com/misht-world/my_map-toll/releases/latest/download/europe-overlay.pmtiles`.
Override via `.env.local`:

```
VITE_PMTILES_URL=http://localhost:8000/europe-overlay.pmtiles
VITE_BASEMAP_STYLE=https://tiles.openfreemap.org/styles/positron
VITE_OVERPASS_URL=https://overpass-api.de/api/interpreter
```

## Automated builds (recommended)

Both the data pipeline and the website are built by GitHub Actions on
GitHub's servers — your PC is not involved.

- **`.github/workflows/data.yml`** — rebuilds the Europe PMTiles overlay.
  Runs monthly on a schedule, or manually from the Actions tab
  ("Run workflow" button). Frees ~30 GB of disk on the runner before
  downloading the Geofabrik extract. Publishes the result as a GitHub
  Release; the web app loads it from `releases/latest/download/…`.
- **`.github/workflows/pages.yml`** — rebuilds the static website on
  every push to `main` and deploys it to GitHub Pages.

One-time setup in the GitHub repo UI:

1. **Settings → Pages → Build and deployment → Source**: set to
   *GitHub Actions* (not branch-based).
2. **Actions → Build data tiles → Run workflow**: run it once to produce
   the first PMTiles release (~40–70 min).

After that, everything is automatic.

## Update the data manually (optional)

Prerequisites (one-time setup):

- [osmium-tool](https://osmcode.org/osmium-tool/) (`brew install osmium-tool` / `apt install osmium-tool`)
- [tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe`)
- [go-pmtiles](https://github.com/protomaps/go-pmtiles) CLI
- [gh](https://cli.github.com/) authenticated (`gh auth login`)
- Node 20+

```bash
npm run data:build     # fetch → filter → normalize → tile
npm run data:publish   # gh release upload
```

Individual steps are also available: `data:fetch`, `data:filter`,
`data:normalize`, `data:tile`.

Expected artefact size for the full Europe overlay: a few tens of MB.

## Publish the site (free)

The built site is 100% static. Any of the following works:

- **GitHub Pages**: `npm run build -w @mmt/web` then publish
  `packages/web/dist/`.
- **Cloudflare Pages**: point it at the repo, build command
  `npm run build -w @mmt/web`, output `packages/web/dist`.

Both are free tiers; no runtime server.

## Project layout

```
packages/
  model/            # Types, statuses, reason codes. Zero deps.
  interpreter/      # Pure OSM-tag → normalized status. Unit-tested.
  tile-builder/     # Node stream that enriches GeoJSON before tippecanoe.
  web/              # MapLibre + PMTiles + OpenFreeMap.
  routing-adapter/  # Empty stub for future Valhalla/GraphHopper integration.

scripts/            # Shell scripts for the data pipeline.
docs/               # Architecture, tag rules, routing plan, limitations, roadmap.
```

## Future routing engine

The evaluation is in [`docs/ROUTING.md`](docs/ROUTING.md). Current
recommendation: **Valhalla**, because its time-dependent costing maps 1:1
to the `Condition` structure our interpreter already produces. The
architecture keeps this choice swappable via `@mmt/routing-adapter`.

## Known limitations

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). The headline ones:
snow-chain tagging is sparse in OSM (layer is expected to be patchy),
season activation is not yet applied to conditional restrictions, and
raw-tag popups depend on Overpass availability.

## What's next

See [`docs/ROADMAP.md`](docs/ROADMAP.md):

1. Calendar-aware filtering of conditional restrictions.
2. Seasonal closures as a distinct layer.
3. Optional place-name search (Nominatim).
4. Routing via Valhalla.
5. Calendar-aware routing.
6. Global coverage.

## License

Code: MIT. Data rendered by this site: © OpenStreetMap contributors (ODbL).
