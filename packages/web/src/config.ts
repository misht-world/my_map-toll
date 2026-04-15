/**
 * Runtime configuration. Values are read from Vite env vars (VITE_*) with
 * sensible defaults so `npm run dev` works out of the box without setup.
 */

const env = import.meta.env;

export const config = {
  /** URL of the overlay PMTiles file. Default points at a GitHub Release asset. */
  pmtilesUrl:
    env.VITE_PMTILES_URL ??
    "https://github.com/misht-world/my_map-toll/releases/latest/download/europe-overlay.pmtiles",

  /** Basemap style JSON. OpenFreeMap — free, keyless, global vector tiles. */
  basemapStyleUrl:
    env.VITE_BASEMAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron",

  /** Overpass API endpoint for lazy-fetching raw tags by osm_id on popup click. */
  overpassUrl:
    env.VITE_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",

  /** Initial map view when no URL hash is present (centered on Europe). */
  defaultView: { center: [10, 50] as [number, number], zoom: 4 },
};
