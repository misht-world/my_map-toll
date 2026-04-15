/**
 * Routing adapter — intentionally empty in the MVP.
 *
 * This package exists to pin down the architectural boundary between the
 * data/normalization layer and a future routing engine (Valhalla or
 * GraphHopper — see docs/ROUTING.md). When routing is added, this module
 * will expose `exportForEngine` below with an implementation that produces
 * engine-specific configuration from our normalized `Segment` model.
 *
 * Keeping the interface here now means:
 *   - the engine choice stays swappable,
 *   - tile-builder / web never depend on a routing engine,
 *   - adding routing is a self-contained change.
 */

import type { Segment } from "@mmt/model";

export type RoutingEngine = "valhalla" | "graphhopper";

export interface ExportResult {
  engine: RoutingEngine;
  /** Path or buffer of the engine-specific artifact. Filled by implementations. */
  artifact: string;
}

/**
 * Export normalized segments in a form consumable by the chosen routing
 * engine. Not implemented in the MVP.
 */
export function exportForEngine(
  _segments: Iterable<Segment>,
  _engine: RoutingEngine,
): ExportResult {
  throw new Error(
    "exportForEngine is not implemented in the MVP. See docs/ROUTING.md.",
  );
}
