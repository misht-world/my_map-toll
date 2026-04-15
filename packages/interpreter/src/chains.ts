import {
  type OsmTags,
  type ChainsResult,
  ChainsReason,
} from "@mmt/model";
import { parseCondition } from "./conditions.js";

/**
 * Interpret OSM tags into a normalized snow-chains requirement status.
 *
 * Unlike toll, the set of chain-related tags is small and less standardized;
 * we take a conservative approach and expose `ambiguous` for signals that
 * imply winter-season access restrictions but do not directly mandate chains.
 */
export function interpretChains(
  tags: OsmTags,
  parseWhen: (expr: string) => unknown = () => null,
): ChainsResult {
  const sc = tags["snow_chains"];
  const scConditional = tags["snow_chains:conditional"];
  const winterRoad = tags["winter_road"];

  if (scConditional) {
    return {
      status: "conditional",
      reason_code: ChainsReason.CONDITIONAL,
      conditions: parseCondition(scConditional, parseWhen),
    };
  }

  if (sc === "required") {
    return { status: "explicit", reason_code: ChainsReason.SNOW_CHAINS_REQUIRED };
  }
  if (sc === "yes") {
    return { status: "explicit", reason_code: ChainsReason.SNOW_CHAINS_YES };
  }

  // winter_road=yes: the road is a seasonal winter road; chains may be
  // required in practice but OSM does not say so directly.
  if (winterRoad === "yes") {
    return { status: "ambiguous", reason_code: ChainsReason.WINTER_ROAD_AMBIGUOUS };
  }

  return { status: "unknown", reason_code: null };
}
