/**
 * Routing helpers: OSRM (route) + Nominatim (geocode) + GPX export.
 *
 * OSRM demo server is free and keyless but rate-limited. For production
 * use, replace OSRM_BASE with a self-hosted or GraphHopper endpoint.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const NOM_BASE  = "https://nominatim.openstreetmap.org/search";

export interface RouteResult {
  /** GeoJSON LineString geometry of the full route. */
  geometry: GeoJSON.LineString;
  /** Total distance in metres. */
  distanceM: number;
  /** Total duration in seconds. */
  durationS: number;
}

/**
 * Geocode a free-text query. Returns [lon, lat] or null on failure.
 * Falls back to raw "lat,lon" / "lon,lat" coordinate parsing so users
 * can paste coordinates directly.
 */
export async function geocode(query: string): Promise<[number, number] | null> {
  const q = query.trim();

  // Try to parse as coordinates first (reuse the same regex family as
  // the existing search box — "lat, lon" or "lon, lat").
  const m = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/.exec(q);
  if (m) {
    const a = parseFloat(m[1]!), b = parseFloat(m[2]!);
    // Heuristic: if |a| ≤ 90 treat as lat/lon, else lon/lat.
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a]; // [lon, lat]
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return [a, b];
  }

  const url = `${NOM_BASE}?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "RoadRestrictionsMap/1.0 (road-restrictions)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Array<{ lon: string; lat: string }>;
  if (!data[0]) return null;
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}

/**
 * Fetch a driving route through the given waypoints (each [lon, lat]).
 * Returns null if routing fails (no route, network error, etc.).
 */
export async function fetchRoute(waypoints: [number, number][]): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    code: string;
    routes?: Array<{
      geometry: GeoJSON.LineString;
      distance: number;
      duration: number;
    }>;
  };
  if (data.code !== "Ok" || !data.routes?.[0]) return null;
  const r = data.routes[0]!;
  return { geometry: r.geometry, distanceM: r.distance, durationS: r.duration };
}

/** Format distance in km (or m if < 1 km). */
export function fmtDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${Math.round(m)} m`;
}

/** Format duration in h m format. */
export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${min} min` : `${min} min`;
}

/**
 * Convert a route geometry to a GPX track file (XML string).
 * The result can be saved as .gpx and loaded into any sat-nav or
 * mapping app that supports GPX (Garmin, OsmAnd, Organic Maps, etc.).
 */
export function toGpx(geometry: GeoJSON.LineString, name = "Route"): string {
  const pts = (geometry.coordinates as [number, number][])
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"></trkpt>`)
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="Road Restrictions Map" ` +
    `xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <trk>\n    <name>${xmlEsc(name)}</name>\n    <trkseg>\n` +
    pts + `\n    </trkseg>\n  </trk>\n</gpx>`
  );
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
