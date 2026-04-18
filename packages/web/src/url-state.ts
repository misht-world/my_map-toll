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
    out.layers = { toll: set.has("toll"), chains: set.has("chains"), ferry: set.has("ferry"), lez: set.has("lez") };
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
  return "#" + params.toString();
}
