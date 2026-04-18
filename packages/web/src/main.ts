import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { TileProperties } from "@mmt/model";

import { config } from "./config.js";
import { overlayLayers, TOLL_LAYER_IDS, CHAINS_LAYER_IDS, FERRY_LAYER_IDS, LEZ_LAYER_IDS } from "./layers.js";
import { parseCoords } from "./search.js";
import { parseHash, formatHash, type UrlState } from "./url-state.js";
import { renderPopup } from "./popup.js";

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
  layers: { toll: true, chains: true, ferry: true, lez: true },
};
const initial = parseHash(window.location.hash, defaultState);

// Persisted basemap style (survives F5). Falls back to config default.
const STYLE_KEY = "mmt:basemapStyle";
const savedStyle = (() => {
  try { return localStorage.getItem(STYLE_KEY) || config.basemapStyleUrl; }
  catch { return config.basemapStyleUrl; }
})();

const tollToggle   = document.getElementById("toggle-toll")   as HTMLInputElement;
const chainsToggle = document.getElementById("toggle-chains") as HTMLInputElement;
const ferryToggle  = document.getElementById("toggle-ferry")  as HTMLInputElement;
const lezToggle    = document.getElementById("toggle-lez")    as HTMLInputElement;
tollToggle.checked   = initial.layers.toll;
chainsToggle.checked = initial.layers.chains;
ferryToggle.checked  = (initial.layers as Record<string, boolean>)["ferry"] ?? true;
lezToggle.checked    = (initial.layers as Record<string, boolean>)["lez"]   ?? true;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const map = new MLMap({
  container: "map",
  style: savedStyle,
  center: [initial.lon, initial.lat],
  zoom: initial.zoom,
  attributionControl: { compact: true },
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
  for (const layer of overlayLayers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
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
  set(TOLL_LAYER_IDS,   tollToggle.checked);
  set(CHAINS_LAYER_IDS, chainsToggle.checked);
  set(FERRY_LAYER_IDS,  ferryToggle.checked);
  set(LEZ_LAYER_IDS,    lezToggle.checked);
  syncHash();
}
tollToggle.addEventListener("change",   applyLayerVisibility);
chainsToggle.addEventListener("change", applyLayerVisibility);
ferryToggle.addEventListener("change",  applyLayerVisibility);
lezToggle.addEventListener("change",    applyLayerVisibility);

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
const interactiveLayers = [...TOLL_LAYER_IDS, ...CHAINS_LAYER_IDS, ...FERRY_LAYER_IDS, ...LEZ_LAYER_IDS]
  .filter(id => !id.endsWith("-hitbox"));

// Hitbox layers are for hit-testing, visible layers for display.
// LEZ fill itself is a generous hit-area (whole polygon).
const allClickLayers = [...TOLL_LAYER_IDS, ...CHAINS_LAYER_IDS, ...FERRY_LAYER_IDS, ...LEZ_LAYER_IDS];

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
map.on("contextmenu", async (e) => {
  const text = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
  try { await navigator.clipboard.writeText(text); cursorEl.textContent = `Copied: ${text}`; }
  catch { /* ignore */ }
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
      layers: { toll: tollToggle.checked, chains: chainsToggle.checked, ferry: ferryToggle.checked, lez: lezToggle.checked },
    });
    if (next !== window.location.hash) history.replaceState(null, "", next);
  }, 200);
}
map.on("moveend", syncHash);
map.on("zoomend",  syncHash);

window.addEventListener("hashchange", () => {
  const s = parseHash(window.location.hash, defaultState);
  map.jumpTo({ center: [s.lon, s.lat], zoom: s.zoom });
  tollToggle.checked   = s.layers.toll;
  chainsToggle.checked = s.layers.chains;
  ferryToggle.checked  = (s.layers as Record<string, boolean>)["ferry"] ?? true;
  lezToggle.checked    = (s.layers as Record<string, boolean>)["lez"]   ?? true;
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
    layers: { toll: tollToggle.checked, chains: chainsToggle.checked, ferry: ferryToggle.checked },
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
