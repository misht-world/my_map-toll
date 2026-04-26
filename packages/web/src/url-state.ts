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
  layers: { toll: boolean; chains: boolean; ferry: boolean; carShuttle: boolean; lez: boolean; seasonal: boolean };
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
    // `v` is a hash format version:
    //   (none) – pre-versioned URLs: layer list is not authoritative, fall back to defaults.
    //   v=2    – layer list is authoritative for the original set of layers
    //            (toll, chains, ferry, lez, seasonal). Newer layers (added in v=3+)
    //            fall back to defaults so old shared links don't hide new layers.
    //   v=3+   – fully authoritative for all layers including carShuttle.
    const v = parseInt(params.get("v") ?? "0", 10);
    // Returns true if the layer name is present in the URL set;
    // false if the URL is authoritative for this layer and it's absent;
    // `def` if the URL predates this layer (not yet authoritative for it).
    const get = (name: keyof UrlState["layers"], def: boolean, introducedInV: number) =>
      set.has(name) ? true : (v >= introducedInV ? false : def);
    out.layers = {
      toll:       get("toll",       fallback.layers.toll,       2),
      chains:     get("chains",     fallback.layers.chains,     2),
      ferry:      get("ferry",      fallback.layers.ferry,      2),
      lez:        get("lez",        fallback.layers.lez,        2),
      seasonal:   get("seasonal",   fallback.layers.seasonal,   2),
      carShuttle: get("carShuttle", fallback.layers.carShuttle, 3), // added in v=3
    };
  }

  return out;
}

export function formatHash(state: UrlState): string {
  const mapParam = `${state.zoom.toFixed(2)}/${state.lat.toFixed(5)}/${state.lon.toFixed(5)}`;
  const activeLayers = [
    state.layers.toll       ? "toll"       : null,
    state.layers.chains     ? "chains"     : null,
    state.layers.ferry      ? "ferry"      : null,
    state.layers.carShuttle ? "carShuttle" : null,
    state.layers.lez        ? "lez"        : null,
    state.layers.seasonal   ? "seasonal"   : null,
  ].filter(Boolean);
  const params = new URLSearchParams();
  params.set("map", mapParam);
  params.set("layers", activeLayers.join(","));
  params.set("v", "3"); // see parseHash for semantics
  return "#" + params.toString();
}
