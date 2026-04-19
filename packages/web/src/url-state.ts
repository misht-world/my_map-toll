/**
 * Two-way binding between the URL hash and the map's viewport + active
 * layers. Format:
 *
 *   #map=<zoom>/<lat>/<lon>&layers=toll,chains
 *
 * The hash is the single source of truth: we read it on startup, write
 * to it on every relevant change (debounced), and listen for external
 * changes (back/forward, pasted links).
 */

export interface UrlState {
  zoom: number;
  lat: number;
  lon: number;
  layers: { toll: boolean; chains: boolean; ferry: boolean; lez: boolean };
}

export function parseHash(hash: string, fallback: UrlState): UrlState {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  const out: UrlState = {
    zoom: fallback.zoom,
    lat: fallback.lat,
    lon: fallback.lon,
    layers: { ...fallback.layers },
  };

  const map = params.get("map");
  if (map) {
    const [z, lat, lon] = map.split("/").map(Number);
    if ([z, lat, lon].every((n) => Number.isFinite(n))) {
      out.zoom = z!;
      out.lat = lat!;
      out.lon = lon!;
    }
  }

  const layers = params.get("layers");
  if (layers !== null) {
    const set = new Set(layers.split(",").map((s) => s.trim()).filter(Boolean));
    // `v` is a hash format version. New URLs we write include v=2, meaning
    // the layer list is authoritative — anything missing is off. Old URLs
    // (no v) predate later layers (e.g. lez): for missing layers we fall
    // back to the default rather than treating them as deliberately off.
    const authoritative = params.has("v");
    const get = (name: keyof UrlState["layers"], def: boolean) =>
      set.has(name) ? true : (authoritative ? false : def);
    out.layers = {
      toll:   get("toll",   fallback.layers.toll),
      chains: get("chains", fallback.layers.chains),
      ferry:  get("ferry",  fallback.layers.ferry),
      lez:    get("lez",    fallback.layers.lez),
    };
  }

  return out;
}

export function formatHash(state: UrlState): string {
  const mapParam = `${state.zoom.toFixed(2)}/${state.lat.toFixed(5)}/${state.lon.toFixed(5)}`;
  const activeLayers = [
    state.layers.toll   ? "toll"   : null,
    state.layers.chains ? "chains" : null,
    state.layers.ferry  ? "ferry"  : null,
    state.layers.lez    ? "lez"    : null,
  ].filter(Boolean);
  const params = new URLSearchParams();
  params.set("map", mapParam);
  params.set("layers", activeLayers.join(","));
  params.set("v", "2"); // see parseHash for semantics
  return "#" + params.toString();
}
