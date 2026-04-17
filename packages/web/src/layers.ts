import type { LayerSpecification } from "maplibre-gl";

const SOURCE = "restrictions";
const SOURCE_LAYER = "restrictions";

// Layer IDs exposed for toggle logic
export const TOLL_LAYER_IDS   = ["toll-hitbox",   "toll-explicit"]              as const;
export const CHAINS_LAYER_IDS = ["chains-hitbox",  "chains-explicit", "chains-conditional", "chains-ambiguous"] as const;
export const FERRY_LAYER_IDS  = ["ferry-hitbox",   "ferry-car"]                 as const;

const base = { type: "line" as const, source: SOURCE, "source-layer": SOURCE_LAYER, minzoom: 3 };

export const overlayLayers: LayerSpecification[] = [

  // ── Invisible wide hit-areas for easy clicking (esp. on mobile) ──────────

  {
    ...base, id: "toll-hitbox",
    filter: ["==", ["get", "toll_status"], "explicit_yes"],
    paint: { "line-color": "transparent", "line-width": 20, "line-opacity": 0 },
  },
  {
    ...base, id: "chains-hitbox",
    filter: ["in", ["get", "chains_status"], ["literal", ["explicit","conditional","ambiguous"]]],
    paint: { "line-color": "transparent", "line-width": 20, "line-opacity": 0 },
  },
  {
    ...base, id: "ferry-hitbox",
    filter: ["==", ["get", "ferry_car"], true],
    paint: { "line-color": "transparent", "line-width": 20, "line-opacity": 0 },
  },

  // ── Toll (cars) — only explicit. Conditional/ambiguous removed per user req ──

  {
    ...base, id: "toll-explicit",
    filter: ["==", ["get", "toll_status"], "explicit_yes"],
    paint: {
      "line-color": "#c62828",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "line-opacity": 0.9,
    },
  },

  // ── Snow chains ───────────────────────────────────────────────────────────

  {
    ...base, id: "chains-explicit",
    filter: ["==", ["get", "chains_status"], "explicit"],
    paint: {
      "line-color": "#1565c0",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "line-opacity": 0.9,
    },
  },
  {
    ...base, id: "chains-conditional",
    filter: ["==", ["get", "chains_status"], "conditional"],
    paint: {
      "line-color": "#0288d1",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2, 12, 4],
      "line-dasharray": [3, 2],
      "line-opacity": 0.85,
    },
  },
  {
    ...base, id: "chains-ambiguous",
    filter: ["==", ["get", "chains_status"], "ambiguous"],
    paint: {
      "line-color": "#90a4ae",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 12, 3],
      "line-dasharray": [1, 2],
      "line-opacity": 0.7,
    },
  },

  // ── Car ferries ───────────────────────────────────────────────────────────

  {
    ...base, id: "ferry-car",
    filter: ["==", ["get", "ferry_car"], true],
    paint: {
      "line-color": "#00838f",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "line-dasharray": [4, 3],
      "line-opacity": 0.9,
    },
  },
];
