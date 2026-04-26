import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { TileProperties } from "@mmt/model";

import { config } from "./config.js";
import { overlayLayers, TOLL_LAYER_IDS, CHAINS_LAYER_IDS, FERRY_LAYER_IDS, CAR_SHUTTLE_LAYER_IDS, LEZ_LAYER_IDS, SEASONAL_LAYER_IDS, TOLL_POINT_LAYER_IDS } from "./layers.js";
import { parseCoords } from "./search.js";
import { parseHash, formatHash, type UrlState } from "./url-state.js";
import { renderPopup } from "./popup.js";
import { geocode, fetchRoute, fmtDistance, fmtDuration, toGpx } from "./routing.js";
import { analyzeRoute, renderSummary } from "./route-summary.js";

// ---------------------------------------------------------------------------
// PMTiles protocol
// ---------------------------------------------------------------------------
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// ---------------------------------------------------------------------------
// Initial state from URL hash
// ---------------------------------------------------------------------------
const defaultState: UrlState = {
  zoom: config.defaultView.zoom,
  lat: config.defaultView.center[1],
  lon: config.defaultView.center[0],
  layers: { toll: true, chains: true, ferry: true, carShuttle: true, lez: true, seasonal: true },
};
const initial = parseHash(window.location.hash, defaultState);

// Persisted basemap style (survives F5). Falls back to config default.
const STYLE_KEY = "mmt:basemapStyle";
const savedStyle = (() => {
  try { return localStorage.getItem(STYLE_KEY) || config.basemapStyleUrl; }
  catch { return config.basemapStyleUrl; }
})();

const tollToggle       = document.getElementById("toggle-toll")         as HTMLInputElement;
const chainsToggle     = document.getElementById("toggle-chains")       as HTMLInputElement;
const ferryToggle      = document.getElementById("toggle-ferry")        as HTMLInputElement;
const carShuttleToggle = document.getElementById("toggle-car-shuttle")  as HTMLInputElement;
const lezToggle        = document.getElementById("toggle-lez")          as HTMLInputElement;
const seasonalToggle   = document.getElementById("toggle-seasonal")     as HTMLInputElement;
tollToggle.checked       = initial.layers.toll;
chainsToggle.checked     = initial.layers.chains;
ferryToggle.checked      = initial.layers.ferry;
carShuttleToggle.checked = initial.layers.carShuttle ?? true;
lezToggle.checked        = initial.layers.lez;
seasonalToggle.checked   = initial.layers.seasonal;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const map = new MLMap({
  container: "map",
  style: savedStyle,
  center: [initial.lon, initial.lat],
  zoom: initial.zoom,
  attributionControl: { compact: true },
  // Disable right-click drag-rotate so RMB shows our context menu instead.
  dragRotate: false,
});

// showCompass:true renders the rotation indicator — click it to reset north.
map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
}), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

// Generate a sparse diagonal hatch pattern as an ImageData and register it
// with MapLibre under the name "lez-hatch". Used by the LEZ fill layer.
// Sparse on purpose — transparent gaps let basemap roads show through, so
// the zone is visible without obscuring the map underneath.
function makeHatchImage(): ImageData {
  const size = 16;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(46, 125, 50, 0.55)"; // dark green, semi-transparent
  ctx.lineWidth = 2;
  ctx.lineCap = "square";
  ctx.beginPath();
  // Three diagonals to make the pattern wrap seamlessly across tile edges.
  ctx.moveTo(-2, size + 2); ctx.lineTo(size + 2, -2);
  ctx.moveTo(-2, size / 2 + 2); ctx.lineTo(size / 2 + 2, -2);
  ctx.moveTo(size / 2 - 2, size + 2); ctx.lineTo(size + 2, size / 2 - 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

// Add our overlay on top of whichever basemap style is active.
// Using `style.load` (not `load`) means this fires for both the initial
// load AND every subsequent `map.setStyle()` call, because setStyle
// strips custom sources/layers that aren't part of the new style.
// Cache the extent GeoJSON so we don't refetch on every style switch.
let extentGeoJson: object | null = null;
async function loadExtent() {
  if (extentGeoJson) return extentGeoJson;
  try {
    const r = await fetch(config.extentUrl);
    if (!r.ok) return null;
    extentGeoJson = await r.json();
    return extentGeoJson;
  } catch { return null; }
}

function addOverlay() {
  if (!map.hasImage("lez-hatch")) {
    map.addImage("lez-hatch", makeHatchImage(), { pixelRatio: 2 });
  }
  if (!map.getSource("restrictions")) {
    map.addSource("restrictions", {
      type: "vector",
      url: "pmtiles://" + config.pmtilesUrl,
      attribution: "© OpenStreetMap contributors (ODbL)",
    });
  }
  // Empty GeoJSON source for the route. Layers referencing it are in
  // overlayLayers (below restriction lines); content set via setData().
  if (!map.getSource("route")) {
    map.addSource("route", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  for (const layer of overlayLayers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }

  // Data-coverage outline. Loaded once asynchronously then re-added on
  // each style.load. Always-on, not in any toggle — it's pure context.
  loadExtent().then((geo) => {
    if (!geo) return;
    if (!map.getSource("extent")) {
      map.addSource("extent", { type: "geojson", data: geo as never });
    }
    if (!map.getLayer("extent-outline")) {
      map.addLayer({
        id: "extent-outline",
        type: "line",
        source: "extent",
        paint: {
          "line-color": "#1a1a1a",
          "line-width": 2,
          "line-opacity": 0.5,
          "line-dasharray": [4, 3],
        },
      });
    }
  });

  applyLayerVisibility();
}
map.on("style.load", addOverlay);

// ---------------------------------------------------------------------------
// Layer toggles
// ---------------------------------------------------------------------------
function applyLayerVisibility() {
  const set = (ids: readonly string[], vis: boolean) => {
    const v = vis ? "visible" : "none";
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
  };
  // Toll booth / gantry point markers follow the Toll roads toggle —
  // they're just another signal that this road is tolled.
  set(TOLL_LAYER_IDS,        tollToggle.checked);
  set(TOLL_POINT_LAYER_IDS,  tollToggle.checked);
  set(CHAINS_LAYER_IDS,      chainsToggle.checked);
  set(FERRY_LAYER_IDS,       ferryToggle.checked);
  set(CAR_SHUTTLE_LAYER_IDS, carShuttleToggle.checked);
  set(LEZ_LAYER_IDS,         lezToggle.checked);
  set(SEASONAL_LAYER_IDS,    seasonalToggle.checked);
  syncHash();
}
tollToggle.addEventListener("change",         applyLayerVisibility);
chainsToggle.addEventListener("change",       applyLayerVisibility);
ferryToggle.addEventListener("change",        applyLayerVisibility);
carShuttleToggle.addEventListener("change",   applyLayerVisibility);
lezToggle.addEventListener("change",          applyLayerVisibility);
seasonalToggle.addEventListener("change",     applyLayerVisibility);

// ---------------------------------------------------------------------------
// Basemap style switcher
// ---------------------------------------------------------------------------
const styleSelect = document.getElementById("style-select") as HTMLSelectElement;
// Restore saved selection if it's one of the options
if ([...styleSelect.options].some(o => o.value === savedStyle)) {
  styleSelect.value = savedStyle;
}
styleSelect.addEventListener("change", () => {
  try { localStorage.setItem(STYLE_KEY, styleSelect.value); } catch { /* ignore */ }
  // diff:false forces a clean style reload so `style.load` fires and our
  // `addOverlay` handler re-adds the source + layers. With the default
  // diff:true MapLibre tries to preserve user state by diffing the style
  // JSONs, and our custom pmtiles source gets dropped without a style.load.
  map.setStyle(styleSelect.value, { diff: false });
});

// ---------------------------------------------------------------------------
// Click → popup  (pass click lngLat for Google Maps link)
// ---------------------------------------------------------------------------
const interactiveLayers = [...TOLL_LAYER_IDS, ...CHAINS_LAYER_IDS, ...FERRY_LAYER_IDS, ...CAR_SHUTTLE_LAYER_IDS, ...LEZ_LAYER_IDS, ...SEASONAL_LAYER_IDS, ...TOLL_POINT_LAYER_IDS]
  .filter(id => !id.endsWith("-hitbox"));

// Hitbox layers are for hit-testing, visible layers for display.
// LEZ fill itself is a generous hit-area (whole polygon).
const allClickLayers = [...TOLL_LAYER_IDS, ...CHAINS_LAYER_IDS, ...FERRY_LAYER_IDS, ...CAR_SHUTTLE_LAYER_IDS, ...LEZ_LAYER_IDS, ...SEASONAL_LAYER_IDS, ...TOLL_POINT_LAYER_IDS];

map.on("click", (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: allClickLayers });
  if (features.length === 0) return;
  // Prefer line features (toll/chains/ferry) over the LEZ polygon when both
  // are under the cursor — clicking a road inside a zone should show the
  // road's info, not the zone.
  const preferred = features.find(f => (f.properties as { kind?: string }).kind !== "lez") ?? features[0]!;
  const props = preferred.properties as unknown as TileProperties;

  new Popup({ maxWidth: "300px" })
    .setLngLat(e.lngLat)
    .setDOMContent(renderPopup(props, e.lngLat))
    .addTo(map);
});

map.on("mouseenter", interactiveLayers, () => { map.getCanvas().style.cursor = "pointer"; });
map.on("mouseleave", interactiveLayers, () => { map.getCanvas().style.cursor = ""; });

// ---------------------------------------------------------------------------
// Coordinate search
// ---------------------------------------------------------------------------
const form        = document.getElementById("coord-form")  as HTMLFormElement;
const coordInput  = document.getElementById("coord-input") as HTMLInputElement;
const coordError  = document.getElementById("coord-error") as HTMLElement;
let searchMarker: maplibregl.Marker | null = null;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const parsed = parseCoords(coordInput.value);
  if (!parsed) {
    coordError.textContent = "Could not parse coordinates. Try: 47.4979, 19.0402";
    coordError.hidden = false;
    return;
  }
  coordError.hidden = true;
  map.flyTo({ center: [parsed.lon, parsed.lat], zoom: Math.max(map.getZoom(), 10) });
  searchMarker?.remove();
  searchMarker = new maplibregl.Marker({ color: "#0a66c2" })
    .setLngLat([parsed.lon, parsed.lat]).addTo(map);
});

// ---------------------------------------------------------------------------
// Cursor coordinates + right-click copy
// ---------------------------------------------------------------------------
const cursorEl = document.getElementById("cursor-coords") as HTMLElement;
map.on("mousemove", (e) => {
  cursorEl.textContent = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
});
// ---------------------------------------------------------------------------
// Context menu (right-click / long-press)
// ---------------------------------------------------------------------------
const ctxMenu = document.getElementById("map-ctx-menu") as HTMLElement;
let ctxLngLat: maplibregl.LngLat | null = null;

function showCtxMenu(lngLat: maplibregl.LngLat, x: number, y: number) {
  ctxLngLat = lngLat;
  const mapRect = map.getContainer().getBoundingClientRect();
  ctxMenu.style.left = `${x - mapRect.left}px`;
  ctxMenu.style.top  = `${y - mapRect.top}px`;
  ctxMenu.hidden = false;
}
function hideCtxMenu() { ctxMenu.hidden = true; }

map.on("contextmenu", (e) => {
  e.preventDefault(); // suppress browser native right-click menu
  showCtxMenu(e.lngLat, e.originalEvent.clientX, e.originalEvent.clientY);
});
map.on("click", () => hideCtxMenu());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCtxMenu(); });

// Long-press on mobile (600 ms, cancel on move)
let longPressTimer: number | undefined;
let longPressPos = { x: 0, y: 0 };
map.getCanvas().addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0]!;
  longPressPos = { x: t.clientX, y: t.clientY };
  longPressTimer = window.setTimeout(() => {
    const rect = map.getContainer().getBoundingClientRect();
    const pt = map.unproject([longPressPos.x - rect.left, longPressPos.y - rect.top]);
    showCtxMenu(pt, longPressPos.x, longPressPos.y);
  }, 600);
}, { passive: true });
map.getCanvas().addEventListener("touchmove",  () => window.clearTimeout(longPressTimer), { passive: true });
map.getCanvas().addEventListener("touchend",   () => window.clearTimeout(longPressTimer), { passive: true });

ctxMenu.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button[data-action]") as HTMLButtonElement | null;
  if (!btn || !ctxLngLat) return;
  const action = btn.dataset["action"];
  hideCtxMenu();
  if (action === "copy") {
    const text = `${ctxLngLat.lat.toFixed(5)}, ${ctxLngLat.lng.toFixed(5)}`;
    try { await navigator.clipboard.writeText(text); cursorEl.textContent = `Copied: ${text}`; }
    catch { /* ignore */ }
    return;
  }
  const ll = ctxLngLat;
  if (action === "start") addWp(ll, 0);
  else if (action === "end") addWp(ll, wps.length);
  // "Via" inserts before the current last point so it becomes a true middle stop
  else if (action === "via") addWp(ll, wps.length >= 2 ? wps.length - 1 : wps.length);
});

// ---------------------------------------------------------------------------
// URL hash sync
// ---------------------------------------------------------------------------
let hashTimer: number | undefined;
function syncHash() {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const c = map.getCenter();
    const next = formatHash({
      zoom: map.getZoom(), lat: c.lat, lon: c.lng,
      layers: { toll: tollToggle.checked, chains: chainsToggle.checked, ferry: ferryToggle.checked, carShuttle: carShuttleToggle.checked, lez: lezToggle.checked, seasonal: seasonalToggle.checked },
    });
    if (next !== window.location.hash) history.replaceState(null, "", next);
  }, 200);
}
map.on("moveend", syncHash);
map.on("zoomend",  syncHash);

window.addEventListener("hashchange", () => {
  const s = parseHash(window.location.hash, defaultState);
  map.jumpTo({ center: [s.lon, s.lat], zoom: s.zoom });
  tollToggle.checked       = s.layers.toll;
  chainsToggle.checked     = s.layers.chains;
  ferryToggle.checked      = s.layers.ferry;
  carShuttleToggle.checked = s.layers.carShuttle;
  lezToggle.checked        = s.layers.lez;
  seasonalToggle.checked   = s.layers.seasonal;
  applyLayerVisibility();
});

// ---------------------------------------------------------------------------
// Share link
// ---------------------------------------------------------------------------
const shareBtn = document.getElementById("share-link") as HTMLButtonElement;
shareBtn.addEventListener("click", async () => {
  window.clearTimeout(hashTimer);
  const c = map.getCenter();
  const hash = formatHash({
    zoom: map.getZoom(), lat: c.lat, lon: c.lng,
    layers: { toll: tollToggle.checked, chains: chainsToggle.checked, ferry: ferryToggle.checked, carShuttle: carShuttleToggle.checked, lez: lezToggle.checked, seasonal: seasonalToggle.checked },
  });
  const url = `${window.location.origin}${window.location.pathname}${hash}`;
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = "Copied!";
    window.setTimeout(() => (shareBtn.textContent = "Copy shareable link"), 1500);
  } catch { shareBtn.textContent = "Copy failed"; }
});

// ---------------------------------------------------------------------------
// Version labels (data snapshot + site build date, injected at build time)
// ---------------------------------------------------------------------------
const vData  = document.getElementById("v-data");
const vBuild = document.getElementById("v-build");
if (vData)  vData.textContent  = config.dataDate  || "unknown";
if (vBuild) vBuild.textContent = config.buildDate || "dev";

// ---------------------------------------------------------------------------
// Mobile panel toggle
// ---------------------------------------------------------------------------
const panel       = document.getElementById("panel")        as HTMLElement;
const panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;

// On mobile (matches the CSS @media breakpoint) start with the panel
// collapsed so it doesn't cover half the map. Desktop is unaffected.
const mobileMQ = window.matchMedia("(max-width: 600px)");
if (mobileMQ.matches) {
  panel.classList.add("collapsed");
  panelToggle.textContent = "☰";
}

panelToggle.addEventListener("click", () => {
  panel.classList.toggle("collapsed");
  panelToggle.textContent = panel.classList.contains("collapsed") ? "☰" : "✕";
});

// ---------------------------------------------------------------------------
// Route planner — waypoint-based (up to 20 points, draggable markers)
// ---------------------------------------------------------------------------
// WayPoint stores both the outer shell (MapLibre anchors on this — always
// 24×24 px so the transform offset never changes) and the inner dot (changes
// size/colour when the role changes without affecting the anchor geometry).
interface WayPoint {
  lngLat: maplibregl.LngLat;
  marker: maplibregl.Marker;
  shell: HTMLElement;   // fixed-size outer div — MapLibre's anchor target
  dot:   HTMLElement;   // inner div that carries colour / letter / size
}
const MAX_WP = 20;
const WP_LABELS = "ABCDEFGHIJKLMNOPQRST";
const wps: WayPoint[] = [];

const routeErrorEl  = document.getElementById("route-error")  as HTMLElement;
const routeStatusEl = document.getElementById("route-status") as HTMLElement;
const routeGpxBtn   = document.getElementById("route-gpx")    as HTMLButtonElement;
const routeClearBtn = document.getElementById("route-clear")  as HTMLButtonElement;
const srchInput     = document.getElementById("route-search-input") as HTMLInputElement;
const srchAddBtn    = document.getElementById("route-search-add")   as HTMLButtonElement;
const wpListEl      = document.getElementById("route-wp-list")      as HTMLElement;
const summaryEl     = document.getElementById("route-summary")      as HTMLElement;

let routeGeometry: GeoJSON.LineString | null = null;

type WpRole = "start" | "via" | "end";
function wpRole(i: number): WpRole {
  if (wps.length <= 1) return i === 0 ? "start" : "via";
  return i === 0 ? "start" : i === wps.length - 1 ? "end" : "via";
}

function makeMarkerEl(): { shell: HTMLElement; dot: HTMLElement } {
  const shell = document.createElement("div");
  shell.className = "route-wp-shell";          // fixed 24×24 px — never changes
  const dot = document.createElement("div");
  dot.className = "route-wp-dot route-wp-dot--via";
  shell.appendChild(dot);
  return { shell, dot };
}

/** Update every marker's dot class + label to reflect its current role. */
function relabelMarkers() {
  wps.forEach((wp, i) => {
    const role = wpRole(i);
    wp.dot.className = `route-wp-dot route-wp-dot--${role}`;
    wp.dot.textContent = role === "start" ? "S" : role === "end" ? "F" : "";
  });
}

function addWp(lngLat: maplibregl.LngLat, idx?: number) {
  if (wps.length >= MAX_WP) return;
  const insertAt = idx !== undefined ? Math.max(0, Math.min(idx, wps.length)) : wps.length;
  const { shell, dot } = makeMarkerEl();
  // anchor:"center" on the 24×24 shell — this never changes size so the
  // translate(-50%,-50%) offset is always exactly -12px and never drifts.
  const marker = new maplibregl.Marker({ element: shell, draggable: true, anchor: "center" })
    .setLngLat(lngLat).addTo(map);
  marker.on("dragend", () => {
    const wp = wps.find(w => w.marker === marker);
    if (wp) { wp.lngLat = marker.getLngLat(); void rebuildRoute(); }
  });
  wps.splice(insertAt, 0, { lngLat, marker, shell, dot });
  relabelMarkers();
  renderWpList();
  void rebuildRoute();
}

function removeWp(idx: number) {
  if (idx < 0 || idx >= wps.length) return;
  wps[idx]!.marker.remove();
  wps.splice(idx, 1);
  relabelMarkers();
  renderWpList();
  void rebuildRoute();
}

function renderWpList() {
  wpListEl.innerHTML = "";
  wps.forEach((wp, i) => {
    const li = document.createElement("li");
    li.className = "route-wp-item";
    li.draggable = true;

    const handle = document.createElement("span");
    handle.className = "route-wp-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";

    const label = document.createElement("span");
    label.className = `route-wp-label route-wp-label--${wpRole(i)}`;
    label.textContent = WP_LABELS[i] ?? String(i + 1);

    const coords = document.createElement("span");
    coords.className = "route-wp-coords";
    coords.textContent = `${wp.lngLat.lat.toFixed(4)}, ${wp.lngLat.lng.toFixed(4)}`;

    const rm = document.createElement("button");
    rm.className = "route-wp-rm";
    rm.textContent = "✕";
    rm.title = "Remove waypoint";
    rm.addEventListener("click", () => removeWp(i));

    // ── HTML5 drag-and-drop reordering ──────────────────────────────────────
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", String(i));
      // Defer adding class so the drag image is captured first
      requestAnimationFrame(() => li.classList.add("dragging"));
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      li.classList.add("drag-over");
    });
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
      const fromIdx = parseInt(e.dataTransfer!.getData("text/plain"), 10);
      if (isNaN(fromIdx) || fromIdx === i) return;
      const [moved] = wps.splice(fromIdx, 1);
      // After splicing out fromIdx the target slot shifts if fromIdx < i
      wps.splice(fromIdx < i ? i - 1 : i, 0, moved!);
      relabelMarkers();
      renderWpList();
      void rebuildRoute();
    });

    li.append(handle, label, coords, rm);
    wpListEl.appendChild(li);
  });
  routeClearBtn.hidden = wps.length === 0;
}

async function rebuildRoute() {
  const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData({ type: "FeatureCollection", features: [] });
  routeGeometry = null;
  routeGpxBtn.hidden = true;
  routeErrorEl.hidden = true;
  routeStatusEl.hidden = true;

  if (wps.length < 2) return;

  const points = wps.map(w => [w.lngLat.lng, w.lngLat.lat] as [number, number]);
  const result = await fetchRoute(points);
  if (!result) {
    routeErrorEl.textContent = "Could not calculate route. Check waypoints or try again.";
    routeErrorEl.hidden = false;
    return;
  }

  routeGeometry = result.geometry;
  const feature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature", geometry: result.geometry, properties: {},
  };
  if (src) src.setData({ type: "FeatureCollection", features: [feature] });

  routeStatusEl.textContent = `${fmtDistance(result.distanceM)} · ${fmtDuration(result.durationS)}`;
  routeStatusEl.hidden = false;
  routeGpxBtn.hidden = false;

  const coords = result.geometry.coordinates as [number, number][];
  const lons = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: 60, maxZoom: 14 },
  );

  // After fitBounds the map loads tiles for the full route extent.
  // Wait for "idle" (all tiles rendered) then run the restriction analysis.
  summaryEl.hidden = true;
  summaryEl.innerHTML = "";
  map.once("idle", () => {
    const summary = analyzeRoute(map, coords);
    renderSummary(summary, summaryEl, (bbox) => {
      map.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 80, maxZoom: 14 },
      );
    });
  });
}

function clearAllRoute() {
  wps.forEach(w => w.marker.remove());
  wps.length = 0;
  renderWpList();
  const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData({ type: "FeatureCollection", features: [] });
  routeGeometry = null;
  routeGpxBtn.hidden = true;
  routeErrorEl.hidden = true;
  routeStatusEl.hidden = true;
  summaryEl.hidden = true;
  summaryEl.innerHTML = "";
}

routeClearBtn.addEventListener("click", clearAllRoute);

srchAddBtn.addEventListener("click", async () => {
  const q = srchInput.value.trim();
  if (!q) return;
  srchAddBtn.disabled = true;
  srchAddBtn.textContent = "…";
  try {
    const pt = await geocode(q);
    if (!pt) {
      routeErrorEl.textContent = `Could not find: "${q}"`;
      routeErrorEl.hidden = false;
      return;
    }
    srchInput.value = "";
    routeErrorEl.hidden = true;
    addWp(new maplibregl.LngLat(pt[0], pt[1]));
    map.flyTo({ center: pt, zoom: Math.max(map.getZoom(), 10) });
  } finally {
    srchAddBtn.disabled = false;
    srchAddBtn.textContent = "Add";
  }
});

srchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") srchAddBtn.click();
});

routeGpxBtn.addEventListener("click", () => {
  if (!routeGeometry) return;
  const name = wps.length >= 2
    ? `${WP_LABELS[0] ?? "A"} → ${WP_LABELS[wps.length - 1] ?? "B"}`
    : "Route";
  const gpx  = toGpx(routeGeometry, name);
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = "route.gpx";
  a.click();
  URL.revokeObjectURL(a.href);
});
