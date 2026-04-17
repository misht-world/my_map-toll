import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { TileProperties } from "@mmt/model";

import { config } from "./config.js";
import { overlayLayers, TOLL_LAYER_IDS, CHAINS_LAYER_IDS, FERRY_LAYER_IDS } from "./layers.js";
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
  layers: { toll: true, chains: true, ferry: true },
};
const initial = parseHash(window.location.hash, defaultState);

const tollToggle   = document.getElementById("toggle-toll")   as HTMLInputElement;
const chainsToggle = document.getElementById("toggle-chains") as HTMLInputElement;
const ferryToggle  = document.getElementById("toggle-ferry")  as HTMLInputElement;
tollToggle.checked   = initial.layers.toll;
chainsToggle.checked = initial.layers.chains;
ferryToggle.checked  = (initial.layers as Record<string, boolean>)["ferry"] ?? true;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const map = new MLMap({
  container: "map",
  style: config.basemapStyleUrl,
  center: [initial.lon, initial.lat],
  zoom: initial.zoom,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
}), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

map.on("load", () => {
  map.addSource("restrictions", {
    type: "vector",
    url: "pmtiles://" + config.pmtilesUrl,
    attribution: "© OpenStreetMap contributors (ODbL)",
  });
  for (const layer of overlayLayers) map.addLayer(layer);
  applyLayerVisibility();
});

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
  syncHash();
}
tollToggle.addEventListener("change",   applyLayerVisibility);
chainsToggle.addEventListener("change", applyLayerVisibility);
ferryToggle.addEventListener("change",  applyLayerVisibility);

// ---------------------------------------------------------------------------
// Basemap style switcher
// ---------------------------------------------------------------------------
const styleSelect = document.getElementById("style-select") as HTMLSelectElement;
styleSelect.addEventListener("change", () => {
  map.setStyle(styleSelect.value);
  // Re-add our overlay after style reload
  map.once("style.load", () => {
    map.addSource("restrictions", {
      type: "vector",
      url: "pmtiles://" + config.pmtilesUrl,
      attribution: "© OpenStreetMap contributors (ODbL)",
    });
    for (const layer of overlayLayers) map.addLayer(layer);
    applyLayerVisibility();
  });
});

// ---------------------------------------------------------------------------
// Click → popup  (pass click lngLat for Google Maps link)
// ---------------------------------------------------------------------------
const interactiveLayers = [...TOLL_LAYER_IDS, ...CHAINS_LAYER_IDS, ...FERRY_LAYER_IDS]
  .filter(id => !id.endsWith("-hitbox"));

// Hitbox layers are for hit-testing, visible layers for display.
// We listen on all layers (hitbox catches wide area, display layers also work).
const allClickLayers = [...TOLL_LAYER_IDS, ...CHAINS_LAYER_IDS, ...FERRY_LAYER_IDS];

map.on("click", (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: allClickLayers });
  if (features.length === 0) return;
  const props = features[0]!.properties as unknown as TileProperties;

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
      layers: { toll: tollToggle.checked, chains: chainsToggle.checked, ferry: ferryToggle.checked },
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
// Mobile panel toggle
// ---------------------------------------------------------------------------
const panel       = document.getElementById("panel")        as HTMLElement;
const panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;
panelToggle.addEventListener("click", () => {
  panel.classList.toggle("collapsed");
  panelToggle.textContent = panel.classList.contains("collapsed") ? "☰" : "✕";
});
