/**
 * Runtime configuration. Values are baked in at build time via Vite env vars.
 *
 * On GitHub Pages: VITE_PMTILES_URL = "/my_map-toll/europe-overlay.pmtiles"
 * (same origin, no CORS/redirect issues with range requests).
 *
 * Locally: run `npm run dev` — the map will load but overlay layers will be
 * empty unless you set VITE_PMTILES_URL in .env.local to a local file.
 */

const env = import.meta.env;

export const config = {
  /** URL of the overlay PMTiles file. */
  pmtilesUrl:
    env.VITE_PMTILES_URL ??
    "https://github.com/misht-world/my_map-toll/releases/latest/download/europe-overlay.pmtiles",

  /** Basemap style JSON — OpenFreeMap, free, keyless, global vector tiles. */
  basemapStyleUrl:
    env.VITE_BASEMAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron",

  /** Overpass API for lazy-fetching raw tags by osm_id on popup click. */
  overpassUrl:
    env.VITE_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",

  /** Initial map view when no URL hash is present (centered on Europe). */
  defaultView: { center: [10, 50] as [number, number], zoom: 4 },
};
