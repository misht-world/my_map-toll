import type { LayerSpecification } from "maplibre-gl";

/**
 * Paint specs for our overlay layers.
 *
 * Two MapLibre layers per logical theme (toll / chains) — one for the base
 * line, one for a dashed "conditional/ambiguous" style — filtered on the
 * normalized `*_status` property written into tiles by the build pipeline.
 */

export const TOLL_LAYER_IDS = ["toll-explicit", "toll-conditional", "toll-ambiguous"] as const;
export const CHAINS_LAYER_IDS = ["chains-explicit", "chains-conditional", "chains-ambiguous"] as const;

const SOURCE = "restrictions";
const SOURCE_LAYER = "restrictions";

const common = {
  type: "line" as const,
  source: SOURCE,
  "source-layer": SOURCE_LAYER,
  minzoom: 3,
};

export const overlayLayers: LayerSpecification[] = [
  // --- Toll (cars) ---
  {
    ...common,
    id: "toll-explicit",
    filter: ["==", ["get", "toll_status"], "explicit_yes"],
    paint: {
      "line-color": "#c62828",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 3],
      "line-opacity": 0.85,
    },
  },
  {
    ...common,
    id: "toll-conditional",
    filter: ["==", ["get", "toll_status"], "conditional"],
    paint: {
      "line-color": "#ef6c00",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 3],
      "line-dasharray": [2, 2],
      "line-opacity": 0.85,
    },
  },
  {
    ...common,
    id: "toll-ambiguous",
    filter: ["==", ["get", "toll_status"], "ambiguous"],
    paint: {
      "line-color": "#9e9e9e",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.5],
      "line-dasharray": [1, 2],
      "line-opacity": 0.7,
    },
  },
  // --- Chains ---
  {
    ...common,
    id: "chains-explicit",
    filter: ["==", ["get", "chains_status"], "explicit"],
    paint: {
      "line-color": "#1565c0",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 3],
      "line-opacity": 0.85,
    },
  },
  {
    ...common,
    id: "chains-conditional",
    filter: ["==", ["get", "chains_status"], "conditional"],
    paint: {
      "line-color": "#0288d1",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 3],
      "line-dasharray": [2, 2],
      "line-opacity": 0.85,
    },
  },
  {
    ...common,
    id: "chains-ambiguous",
    filter: ["==", ["get", "chains_status"], "ambiguous"],
    paint: {
      "line-color": "#90a4ae",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.5],
      "line-dasharray": [1, 2],
      "line-opacity": 0.7,
    },
  },
];
