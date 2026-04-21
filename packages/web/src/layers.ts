import type { LayerSpecification } from "maplibre-gl";

const SOURCE = "restrictions";
const SOURCE_LAYER = "restrictions";

// Layer IDs exposed for toggle logic
export const TOLL_LAYER_IDS   = ["toll-hitbox",   "toll-explicit"]              as const;
export const CHAINS_LAYER_IDS = ["chains-hitbox",  "chains-any"] as const;
export const FERRY_LAYER_IDS  = ["ferry-hitbox",   "ferry-car"]                 as const;
export const LEZ_LAYER_IDS    = ["lez-fill",       "lez-outline"]               as const;
export const SEASONAL_LAYER_IDS   = ["seasonal-hitbox", "seasonal-winter-closure", "seasonal-winter-only"] as const;
export const TOLL_POINT_LAYER_IDS = ["toll-point"] as const;

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
  {
    ...base, id: "seasonal-hitbox",
    filter: ["in", ["get", "seasonal_status"], ["literal", ["winter_closure", "winter_only_road"]]],
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

  // ── Snow chains (single style for all statuses) ──────────────────────────
  // Status specifics (required/conditional/possible) are shown in the popup.
  // A unified visual makes the "chains might matter here" signal easier to
  // spot at a glance.

  {
    ...base, id: "chains-any",
    filter: ["in", ["get", "chains_status"], ["literal", ["explicit", "conditional", "ambiguous"]]],
    paint: {
      "line-color": "#1565c0",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "line-opacity": 0.9,
    },
  },

  // ── Seasonal closures (mountain passes, ice roads) ───────────────────────

  {
    ...base, id: "seasonal-winter-closure",
    filter: ["==", ["get", "seasonal_status"], "winter_closure"],
    paint: {
      // Slate-grey dashed line: "closed for the season"
      "line-color": "#455a64",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "line-dasharray": [2, 2],
      "line-opacity": 0.9,
    },
  },
  {
    ...base, id: "seasonal-winter-only",
    filter: ["==", ["get", "seasonal_status"], "winter_only_road"],
    paint: {
      // Light blue dashed: "winter-only" (ice road)
      "line-color": "#80deea",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "line-dasharray": [1, 2],
      "line-opacity": 0.95,
    },
  },

  // ── Toll booth / gantry nodes ─────────────────────────────────────────────
  // Small circle markers on point features (barrier=toll_booth,
  // highway=toll_gantry). Visible from zoom 8 so they don't clutter low zooms.

  {
    id: "toll-point",
    type: "circle",
    source: SOURCE,
    "source-layer": SOURCE_LAYER,
    minzoom: 8,
    filter: ["==", ["get", "kind"], "toll_point"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 13, 8],
      "circle-color": "#c62828",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.85,
    },
  },

  // ── Car ferries ───────────────────────────────────────────────────────────

  {
    ...base, id: "ferry-car",
    filter: ["==", ["get", "ferry_car"], true],
    paint: {
      // Thinner than toll/chains: ferry routes are long straight lines
      // across open water and tend to dominate visually otherwise.
      "line-color": "#00838f",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 2.5],
      "line-dasharray": [4, 3],
      "line-opacity": 0.85,
    },
  },
];
