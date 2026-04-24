/**
 * Route summary: spatial analysis of what restrictions lie on the calculated
 * route, combined with the country-level vignette/toll table.
 *
 * Analysis uses map.querySourceFeatures() (data already in PMTiles tiles that
 * were loaded when the route was fitted into view) — no external API needed.
 */

import type { Map as MLMap } from "maplibre-gl";
import type { TileProperties } from "@mmt/model";
import { COUNTRY_TOLL_INFO } from "./vignette-countries.js";

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

// ── Public API ───────────────────────────────────────────────────────────────

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
  tollSegments:   number;   // tagged toll road segments
  tollPoints:     number;   // toll booth / gantry nodes
  chainSegments:  number;
  ferrySegments:  number;
  lezCount:       number;
  winterClosures: number;
  winterOnlyRoads: number;
}

export function analyzeRoute(map: MLMap, routeCoords: [number, number][]): RouteSummary {
  const bbox = routeBbox(routeCoords);

  // ── Query all restriction features from loaded tiles ──────────────────────
  const raw = map.querySourceFeatures("restrictions", { sourceLayer: "restrictions" });

  // Deduplicate: same OSM feature can appear in multiple tiles.
  const seen = new Set<string>();
  const features = raw.filter((f) => {
    // Use OSM id + geometry type as dedup key; fall back to first coord string.
    const coords = flatCoords(f.geometry);
    const key = `${f.id ?? "?"}_${f.geometry.type}_${coords[0]?.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Count restriction types on the route ─────────────────────────────────
  let tollSegments = 0, tollPoints = 0, chainSegments = 0,
      ferrySegments = 0, lezCount = 0, winterClosures = 0, winterOnlyRoads = 0;

  for (const f of features) {
    const props  = f.properties as TileProperties;
    const coords = flatCoords(f.geometry);
    if (coords.length === 0) continue;
    if (!isNearRoute(coords, routeCoords, bbox)) continue;

    if (props.kind === "toll_point") { tollPoints++;  continue; }
    if (props.kind === "lez")        { lezCount++;    continue; }
    if (props.toll_status === "explicit_yes" && !props.ferry_car)  tollSegments++;
    if (props.chains_status === "explicit" ||
        props.chains_status === "conditional" ||
        props.chains_status === "ambiguous")                        chainSegments++;
    if (props.ferry_car)                                            ferrySegments++;
    if (props.seasonal_status === "winter_closure")                 winterClosures++;
    if (props.seasonal_status === "winter_only_road")               winterOnlyRoads++;
  }

  // ── Detect countries (sample route points, check against bbox table) ──────
  const step = Math.max(1, Math.floor(routeCoords.length / 40));
  const sample = routeCoords.filter((_, i) => i % step === 0);

  const detected = new Set<string>();
  for (const [lon, lat] of sample) {
    for (const [code, info] of Object.entries(COUNTRY_TOLL_INFO)) {
      const [cW, cS, cE, cN] = info.bbox;
      if (lon >= cW && lon <= cE && lat >= cS && lat <= cN) detected.add(code);
    }
  }

  // Build country list:
  // • Vignette countries: always shown when on route.
  // • Non-vignette toll countries: shown only when PMTiles found toll features
  //   (avoids spurious entries when route merely clips a country corner).
  const countries = [...detected]
    .map((code) => {
      const info = COUNTRY_TOLL_INFO[code]!;
      return {
        code,
        name: info.name,
        vignette: info.vignette,
        vignetteNote: info.vignetteNote,
        hasTolls: info.hasTolls,
        extraTollNote: info.extraTollNote,
        tollConfirmed: tollSegments > 0 || tollPoints > 0,
      };
    })
    .filter((c) => c.vignette || (c.hasTolls && c.tollConfirmed));

  return { countries, tollSegments, tollPoints, chainSegments, ferrySegments, lezCount, winterClosures, winterOnlyRoads };
}

// ── DOM renderer ─────────────────────────────────────────────────────────────

export function renderSummary(summary: RouteSummary, container: HTMLElement): void {
  container.innerHTML = "";

  const { countries, tollSegments, tollPoints, chainSegments,
          ferrySegments, lezCount, winterClosures, winterOnlyRoads } = summary;

  const hasAnything = countries.length > 0 || tollSegments > 0 || tollPoints > 0 ||
    chainSegments > 0 || ferrySegments > 0 || lezCount > 0 ||
    winterClosures > 0 || winterOnlyRoads > 0;

  if (!hasAnything) {
    container.hidden = true;
    return;
  }

  const root = document.createElement("div");
  root.className = "route-summary";

  function row(icon: string, text: string, sub?: string): HTMLElement {
    const div = document.createElement("div");
    div.className = "rs-row";
    div.innerHTML = `<span class="rs-icon">${icon}</span><span class="rs-text">${text}${sub ? `<br><span class="rs-sub">${sub}</span>` : ""}</span>`;
    return div;
  }

  // ── Country / payment section ─────────────────────────────────────────────
  if (countries.length > 0) {
    const hdr = document.createElement("div");
    hdr.className = "rs-header";
    hdr.textContent = "Расходы на дороге";
    root.appendChild(hdr);

    for (const c of countries) {
      if (c.vignette) {
        // Vignette country — always show
        let sub = c.vignetteNote ?? "";
        if (c.tollConfirmed && c.hasTolls && c.extraTollNote) {
          // PMTiles also found toll features AND country is known to have extra tolls
          sub += (sub ? " · " : "") + `⚠️ ${c.extraTollNote}`;
        } else if (c.tollConfirmed && c.hasTolls) {
          sub += (sub ? " · " : "") + "⚠️ Возможны платные участки вне виньетки";
        }
        root.appendChild(row("🎫", `<b>${c.name}</b> — виньетка обязательна`, sub || undefined));
      } else {
        // Non-vignette toll country — shown because PMTiles confirmed toll roads
        root.appendChild(row("💰", `<b>${c.name}</b> — платные дороги`));
      }
    }
  }

  // ── Road conditions section ───────────────────────────────────────────────
  const conditions: HTMLElement[] = [];
  if (chainSegments > 0)
    conditions.push(row("⛓️", `Цепи: ${chainSegments} уч.`, "Возможно обязательны или рекомендованы"));
  if (ferrySegments > 0)
    conditions.push(row("⛴️", `Паром: ${ferrySegments} переправа${ferrySegments > 1 ? "ы" : ""}`));
  if (lezCount > 0)
    conditions.push(row("🌿", `Зона низких выбросов: ${lezCount}`));
  if (winterClosures > 0)
    conditions.push(row("❄️", `Зимнее закрытие: ${winterClosures} уч.`, "Перевал может быть закрыт зимой"));
  if (winterOnlyRoads > 0)
    conditions.push(row("🧊", `Зимняя дорога (лёд): ${winterOnlyRoads} уч.`));
  // Mention toll booths only if no country-level toll info was shown
  if (tollPoints > 0 && countries.length === 0)
    conditions.push(row("💰", `Пункты оплаты: ${tollPoints}`));

  if (conditions.length > 0) {
    if (countries.length > 0) {
      const hdr = document.createElement("div");
      hdr.className = "rs-header";
      hdr.textContent = "Условия на дороге";
      root.appendChild(hdr);
    }
    for (const c of conditions) root.appendChild(c);
  }

  container.appendChild(root);
  container.hidden = false;
}
