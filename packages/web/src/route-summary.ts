/**
 * Route summary: spatial analysis of what restrictions lie on the calculated
 * route, combined with country detection via Nominatim reverse geocoding.
 *
 * Restriction analysis: synchronous, uses map.querySourceFeatures() on the
 * PMTiles data already loaded in the viewport.
 *
 * Country detection: asynchronous, calls Nominatim /reverse for 7 evenly-
 * spaced route points in parallel. Returns real country codes, not bbox guesses,
 * so even routes running close to a border don't pick up the wrong country.
 */

import type { Map as MLMap } from "maplibre-gl";
import type { TileProperties } from "@mmt/model";
import { COUNTRY_TOLL_INFO } from "./vignette-countries.js";

const NOM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

// ── Geometry helpers ─────────────────────────────────────────────────────────

function ptSegDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Returns true if any point of `featureCoords` is within `threshold` degrees
 * of any segment of `routeCoords`.
 * Quick bbox pre-filter avoids the O(n×m) inner loop for distant features.
 */
function isNearRoute(
  featureCoords: [number, number][],
  routeCoords:   [number, number][],
  routeBbox: [number, number, number, number],
  threshold = 0.0008,           // ~90 m at mid-latitudes
): boolean {
  const [rW, rS, rE, rN] = routeBbox;
  const buf = threshold + 0.001;
  for (const [fx, fy] of featureCoords) {
    if (fx < rW - buf || fx > rE + buf || fy < rS - buf || fy > rN + buf) continue;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const [ax, ay] = routeCoords[i]!;
      const [bx, by] = routeCoords[i + 1]!;
      if (ptSegDist(fx, fy, ax, ay, bx, by) < threshold) return true;
    }
  }
  return false;
}

function flatCoords(geom: GeoJSON.Geometry): [number, number][] {
  switch (geom.type) {
    case "Point":           return [geom.coordinates as [number, number]];
    case "LineString":      return geom.coordinates as [number, number][];
    case "MultiLineString": return (geom.coordinates as [number, number][][]).flat();
    case "Polygon":         return (geom.coordinates as [number, number][][]).flat();
    case "MultiPolygon":    return (geom.coordinates as [number, number][][][]).flat(2);
    default:                return [];
  }
}

function routeBbox(coords: [number, number][]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < w) w = lon; if (lon > e) e = lon;
    if (lat < s) s = lat; if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

/** Grow a bbox to include a point. */
function expandBbox(
  bbox: [number, number, number, number] | null,
  lon: number,
  lat: number,
): [number, number, number, number] {
  if (!bbox) return [lon, lat, lon, lat];
  return [
    Math.min(bbox[0], lon), Math.min(bbox[1], lat),
    Math.max(bbox[2], lon), Math.max(bbox[3], lat),
  ];
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Per-category statistics with a bounding box for "zoom to" functionality. */
export interface CategoryStats {
  count: number;
  /** Bounding box of all matching features; null when count === 0. */
  bbox: [number, number, number, number] | null;
}

export interface RouteSummary {
  /** Countries the route passes through, enriched with toll/vignette metadata. */
  countries: Array<{
    code: string;
    name: string;
    vignette: boolean;
    vignetteNote?: string;
    hasTolls: boolean;
    extraTollNote?: string;
    /** True when PMTiles found actual tagged toll features on this route. */
    tollConfirmed: boolean;
  }>;
  tollSegments:   CategoryStats;
  tollPoints:     CategoryStats;
  chains:         CategoryStats;
  ferry:          CategoryStats;
  carShuttle:     CategoryStats;
  lez:            CategoryStats;
  winterClosures: CategoryStats;
  winterOnlyRoads: CategoryStats;
}

export function analyzeRoute(map: MLMap, routeCoords: [number, number][]): RouteSummary {
  const bbox = routeBbox(routeCoords);

  // ── Query all restriction features from loaded tiles ──────────────────────
  const raw = map.querySourceFeatures("restrictions", { sourceLayer: "restrictions" });

  // Deduplicate: same OSM feature can appear in multiple tiles.
  const seen = new Set<string>();
  const features = raw.filter((f) => {
    const coords = flatCoords(f.geometry);
    const key = `${f.id ?? "?"}_${f.geometry.type}_${coords[0]?.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Count restriction types on the route ─────────────────────────────────
  function emptyStats(): CategoryStats { return { count: 0, bbox: null }; }

  const tollSegments    = emptyStats();
  const tollPoints      = emptyStats();
  const chains          = emptyStats();
  const ferry           = emptyStats();
  const carShuttle      = emptyStats();
  const lez             = emptyStats();
  const winterClosures  = emptyStats();
  const winterOnlyRoads = emptyStats();

  function accumulate(stats: CategoryStats, coords: [number, number][]) {
    stats.count++;
    for (const [lon, lat] of coords) {
      stats.bbox = expandBbox(stats.bbox, lon, lat);
    }
  }

  for (const f of features) {
    const props  = f.properties as TileProperties;
    const coords = flatCoords(f.geometry);
    if (coords.length === 0) continue;
    if (!isNearRoute(coords, routeCoords, bbox)) continue;

    if (props.kind === "toll_point") { accumulate(tollPoints, coords); continue; }
    if (props.kind === "lez")        { accumulate(lez, coords);        continue; }
    if (props.toll_status === "explicit_yes" && !props.ferry_car && !props.car_shuttle)
                                                                    accumulate(tollSegments, coords);
    if (props.chains_status === "explicit" ||
        props.chains_status === "conditional" ||
        props.chains_status === "ambiguous")                        accumulate(chains, coords);
    if (props.ferry_car)                                            accumulate(ferry, coords);
    if (props.car_shuttle)                                          accumulate(carShuttle, coords);
    if (props.seasonal_status === "winter_closure")                 accumulate(winterClosures, coords);
    if (props.seasonal_status === "winter_only_road")               accumulate(winterOnlyRoads, coords);
  }

  // Countries are detected asynchronously via fetchRouteCountries().
  // analyzeRoute() itself returns an empty list so the caller can render
  // road-conditions immediately while country detection is in flight.
  return { countries: [], tollSegments, tollPoints, chains, ferry, carShuttle, lez, winterClosures, winterOnlyRoads };
}

// ── Country detection via Nominatim reverse geocoding ────────────────────────

/** Haversine distance in km between two [lon, lat] points. */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat
          + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Pick N points evenly distributed by distance along the route.
 * Avoids the index-based approach which over-samples dense city segments.
 */
function sampleByDistance(coords: [number, number][], n: number): [number, number][] {
  if (coords.length === 0) return [];
  if (n <= 1) return [coords[0]!];
  if (coords.length <= n) return [...coords];

  // Build cumulative distance array.
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1]! + haversineKm(coords[i - 1]!, coords[i]!));
  }
  const total = cum[cum.length - 1]!;
  if (total === 0) return [coords[0]!];

  const samples: [number, number][] = [];
  for (let s = 0; s < n; s++) {
    const target = (s / (n - 1)) * total;
    // Binary search for the index closest to target distance.
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < target) lo = mid + 1; else hi = mid;
    }
    samples.push(coords[lo]!);
  }
  return samples;
}

type CountryEntry = RouteSummary["countries"][number];

/**
 * Detect countries along the route via Nominatim reverse geocoding.
 * Samples 7 evenly-spaced points, fires all requests in parallel.
 *
 * @param anyTollFound  Whether PMTiles found toll features on this route.
 *                      Controls whether non-vignette toll countries are shown.
 * @param signal        Optional AbortSignal — pass one so the caller can cancel
 *                      when the user clears the route or recalculates.
 */
export async function fetchRouteCountries(
  routeCoords: [number, number][],
  anyTollFound: boolean,
  signal?: AbortSignal,
): Promise<CountryEntry[]> {
  if (routeCoords.length === 0) return [];

  const samples = sampleByDistance(routeCoords, 7);

  // Fire all reverse-geocode requests in parallel.
  // zoom=3 returns country-level results without over-fetching.
  const settled = await Promise.allSettled(
    samples.map(([lon, lat]) =>
      fetch(
        `${NOM_REVERSE}?format=json&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&zoom=3`,
        { signal, headers: { "User-Agent": "RoadRestrictionsMap/1.0" } },
      )
        .then(r => (r.ok ? r.json() : null) as Promise<{ address?: { country_code?: string } } | null>)
        .then(d => d?.address?.country_code?.toUpperCase() ?? null),
    ),
  );

  const detected = new Set<string>();
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) detected.add(r.value);
  }

  return [...detected]
    .filter(code => code in COUNTRY_TOLL_INFO)
    .map(code => {
      const info = COUNTRY_TOLL_INFO[code]!;
      return {
        code,
        name:          info.name,
        vignette:      info.vignette,
        vignetteNote:  info.vignetteNote,
        hasTolls:      info.hasTolls,
        extraTollNote: info.extraTollNote,
        tollConfirmed: anyTollFound,
      };
    })
    .filter(c => c.vignette || (c.hasTolls && c.tollConfirmed));
}

// ── DOM renderer ─────────────────────────────────────────────────────────────

/**
 * Render the route summary into `container`.
 * @param onFlyTo  Called when the user clicks a count link; receives the
 *                 bounding box of the matching features so the caller can
 *                 `map.fitBounds(bbox, { padding: 80 })`.
 */
export function renderSummary(
  summary: RouteSummary,
  container: HTMLElement,
  onFlyTo?: (bbox: [number, number, number, number]) => void,
): void {
  container.innerHTML = "";

  const { countries, tollSegments, tollPoints, chains,
          ferry, carShuttle, lez, winterClosures, winterOnlyRoads } = summary;

  const hasAnything = countries.length > 0 ||
    tollSegments.count > 0 || tollPoints.count > 0 ||
    chains.count > 0 || ferry.count > 0 || carShuttle.count > 0 || lez.count > 0 ||
    winterClosures.count > 0 || winterOnlyRoads.count > 0;

  if (!hasAnything) {
    container.hidden = true;
    return;
  }

  const root = document.createElement("div");
  root.className = "route-summary";

  /** Plain-text row with icon. */
  function row(icon: string, text: string, sub?: string): HTMLElement {
    const div = document.createElement("div");
    div.className = "rs-row";
    div.innerHTML = `<span class="rs-icon">${icon}</span><span class="rs-text">${text}${sub ? `<br><span class="rs-sub">${sub}</span>` : ""}</span>`;
    return div;
  }

  /**
   * Row where `count` is a clickable button that flies to the feature bbox.
   * Falls back to plain text if no bbox is available or no onFlyTo provided.
   */
  function countRow(
    icon: string,
    stats: CategoryStats,
    label: (n: number) => string,
    sub?: string,
  ): HTMLElement {
    const div = document.createElement("div");
    div.className = "rs-row";

    const iconEl = document.createElement("span");
    iconEl.className = "rs-icon";
    iconEl.textContent = icon;

    const textEl = document.createElement("span");
    textEl.className = "rs-text";

    if (onFlyTo && stats.bbox) {
      const btn = document.createElement("button");
      btn.className = "rs-count-link";
      btn.textContent = label(stats.count);
      const captureBbox = stats.bbox;
      btn.addEventListener("click", () => onFlyTo(captureBbox));
      textEl.appendChild(btn);
    } else {
      textEl.appendChild(document.createTextNode(label(stats.count)));
    }

    if (sub) {
      const subEl = document.createElement("br");
      textEl.appendChild(subEl);
      const subSpan = document.createElement("span");
      subSpan.className = "rs-sub";
      subSpan.textContent = sub;
      textEl.appendChild(subSpan);
    }

    div.append(iconEl, textEl);
    return div;
  }

  // ── Country / payment section ─────────────────────────────────────────────
  if (countries.length > 0) {
    const hdr = document.createElement("div");
    hdr.className = "rs-header";
    hdr.textContent = "Road costs";
    root.appendChild(hdr);

    for (const c of countries) {
      if (c.vignette) {
        let sub = c.vignetteNote ?? "";
        if (c.tollConfirmed && c.hasTolls && c.extraTollNote) {
          sub += (sub ? " · " : "") + `⚠️ ${c.extraTollNote}`;
        } else if (c.tollConfirmed && c.hasTolls) {
          sub += (sub ? " · " : "") + "⚠️ Additional tolls possible outside vignette";
        }
        root.appendChild(row("🎫", `<b>${c.name}</b> — vignette required`, sub || undefined));
      } else {
        root.appendChild(row("💰", `<b>${c.name}</b> — toll roads`));
      }
    }
  }

  // ── Road conditions section ───────────────────────────────────────────────
  const conditions: HTMLElement[] = [];

  if (chains.count > 0)
    conditions.push(countRow(
      "⛓️",
      chains,
      n => `Snow chains: ${n} segment${n > 1 ? "s" : ""}`,
      "May be required or recommended",
    ));

  if (ferry.count > 0)
    conditions.push(countRow(
      "⛴️",
      ferry,
      n => `Car ferry: ${n} crossing${n > 1 ? "s" : ""}`,
    ));

  if (carShuttle.count > 0)
    conditions.push(countRow(
      "🚂",
      carShuttle,
      n => `Car-shuttle train/tunnel: ${n} section${n > 1 ? "s" : ""}`,
      "Drive your car onto the train or through the tunnel",
    ));

  if (lez.count > 0)
    conditions.push(countRow(
      "🌿",
      lez,
      n => `Low emission zone${n > 1 ? `s: ${n}` : ""}`,
    ));

  if (winterClosures.count > 0)
    conditions.push(countRow(
      "❄️",
      winterClosures,
      n => `Winter closure: ${n} segment${n > 1 ? "s" : ""}`,
      "Mountain passes may be closed in winter",
    ));

  if (winterOnlyRoads.count > 0)
    conditions.push(countRow(
      "🧊",
      winterOnlyRoads,
      n => `Winter-only road (ice): ${n} segment${n > 1 ? "s" : ""}`,
    ));

  // Mention toll booths only if no country-level toll info was shown
  if (tollPoints.count > 0 && countries.length === 0)
    conditions.push(countRow(
      "💰",
      tollPoints,
      n => `Toll booth${n > 1 ? `s: ${n}` : ""}`,
    ));

  if (conditions.length > 0) {
    if (countries.length > 0) {
      const hdr = document.createElement("div");
      hdr.className = "rs-header";
      hdr.textContent = "Road conditions";
      root.appendChild(hdr);
    }
    for (const c of conditions) root.appendChild(c);
  }

  container.appendChild(root);
  container.hidden = false;
}
