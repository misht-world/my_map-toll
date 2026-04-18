import type { LayerSpecification } from "maplibre-gl";

const SOURCE = "restrictions";
const SOURCE_LAYER = "restrictions";

// Layer IDs exposed for toggle logic
export const TOLL_LAYER_IDS   = ["toll-hitbox",   "toll-explicit"]              as const;
export const CHAINS_LAYER_IDS = ["chains-hitbox",  "chains-explicit", "chains-conditional", "chains-ambiguous"] as const;
export const FERRY_LAYER_IDS  = ["ferry-hitbox",   "ferry-car"]                 as const;
export const LEZ_LAYER_IDS    = ["lez-fill",       "lez-outline"]               as const;

const base = { type: "line" as const, source: SOURCE, "source-layer": SOURCE_LAYER, minzoom: 3 };

export const overlayLayers: LayerSpecification[] = [

  // ── Low Emission Zones (drawn FIRST so road overlays render on top) ──────
  // The fill uses a sparse diagonal hatch image registered at runtime
  // (see registerHatchImage in main.ts). Its transparent gaps let basemap
  // roads show through, and our toll/chains/ferry lines sit above it.

  {
    id: "lez-fill",
    type: "fill",
    source: SOURCE,
    "source-layer": SOURCE_LAYER,
    minzoom: 5,
    filter: ["==", ["get", "kind"], "lez"],
    paint: {
      "fill-pattern": "lez-hatch",
      "fill-opacity": 0.85,
    },
  },
  {
    id: "lez-outline",
    type: "line",
    source: SOURCE,
    "source-layer": SOURCE_LAYER,
    minzoom: 5,
    filter: ["==", ["get", "kind"], "lez"],
    paint: {
      "line-color": "#2e7d32",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2],
      "line-opacity": 0.9,
    },
  },

  // ── Invisible wide hit-areas for easy clicking (esp. on mobile) ──────────

  {
    ...base, id: "toll-hitbox",
    // Exclude ferries — they live only in the ferry layer. The `!=` on a
    // missing prop is `true` in MapLibre filter semantics, so non-ferries pass.
    filter: ["all",
      ["==", ["get", "toll_status"], "explicit_yes"],
      ["!=", ["get", "ferry_car"], true],
    ],
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
    // Exclude ferries — they live only in the ferry layer. The `!=` on a
    // missing prop is `true` in MapLibre filter semantics, so non-ferries pass.
    filter: ["all",
      ["==", ["get", "toll_status"], "explicit_yes"],
      ["!=", ["get", "ferry_car"], true],
    ],
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
