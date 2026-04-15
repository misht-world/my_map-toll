# Known limitations

## Data limitations (OSM)

- **Snow-chain tagging is sparse and uneven across Europe.** Many regions
  with genuine chain requirements (rural Alpine passes, Pyrenees, parts of
  the Carpathians) do not carry `snow_chains*` tags. The chains layer is
  therefore expected to have large geographic gaps. This is a property of
  the data, not a bug.
- **Bare `toll=yes` is treated as "applies to cars".** This is our
  documented assumption (see `TAG_INTERPRETATION.md`). Where an OSM author
  intended to exclude cars but did not add `toll:motorcar=no`, our map
  may show a false positive. We accept this trade-off.
- **HGV-only toll** (`toll:hgv=yes` with no car information) is surfaced
  as `ambiguous`, not as "no toll for cars". No data is silently dropped.
- **Data is a snapshot.** Tiles are built from a single Geofabrik extract.
  Updates require running the pipeline again.

## MVP-scope limitations

- **Season activity is not computed.** A segment marked `conditional`
  records that the restriction is time-dependent and that the condition
  has been parsed; it does not yet filter by today's date. That arrives
  in the next iteration (`ROADMAP.md`).
- **No routing.** The architecture is prepared for it, but the MVP only
  visualizes.
- **No place-name search.** Only coordinate input.
- **Popups depend on Overpass API.** Raw tags are fetched from
  `overpass-api.de` on click. If Overpass is slow or unreachable, the
  popup still shows the normalized status + reason code but the raw-tag
  table displays a failure message.
- **Europe only.** Global coverage is an explicit roadmap item, not an
  MVP goal.
- **Data updates are manual.** A single `npm run data:build` is the
  contract; no CI auto-refresh in the MVP.

## Technical caveats

- **Overpass rate-limits** may affect heavy popup use. Self-hosting an
  Overpass instance is out of scope for the MVP but is the obvious
  mitigation if traffic grows.
- **OpenFreeMap basemap** is a free third-party service. If it goes down
  or changes terms, the `VITE_BASEMAP_STYLE` env var lets any MapLibre
  style URL be substituted.
