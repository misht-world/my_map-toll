import {
  type OsmTags,
  type TollResult,
  TollReason,
} from "@mmt/model";
import { parseCondition } from "./conditions.js";

/**
 * Interpret OSM tags into a normalized toll-for-cars status.
 *
 * Returns `{ status: "unknown", reason_code: null }` when no toll-related
 * tag is present; the caller should typically drop such segments from the
 * toll layer.
 *
 * Rules — see docs/TAG_INTERPRETATION.md for rationale and examples.
 */
export function interpretToll(
  tags: OsmTags,
  parseWhen: (expr: string) => unknown = () => null,
): TollResult {
  // If the road is not accessible to cars at all, there is no relevant toll.
  // These access tags take priority over any toll tags.
  const access       = tags["access"];
  const vehicle      = tags["vehicle"];
  const motorVehicleAccess = tags["motor_vehicle"];
  const motorcycleAccess   = tags["motorcar"];

  // "no" without an exception means cars cannot use the road → not our map.
  if (access === "no" || vehicle === "no" || motorVehicleAccess === "no" || motorcycleAccess === "no") {
    return { status: "unknown", reason_code: null };
  }

  const motorcar = tags["toll:motorcar"];
  const motorVehicle = tags["toll:motor_vehicle"];
  const generic = tags["toll"];

  // Collect conditional tags first — highest precedence when present,
  // because the segment's toll status genuinely depends on time/date.
  const conditionalTags = Object.entries(tags).filter(([k]) =>
    /^toll(:[^:]+)?:conditional$/.test(k),
  );

  // Explicit per-vehicle signals (for cars specifically).
  if (motorcar === "yes") {
    return { status: "explicit_yes", reason_code: TollReason.MOTORCAR_YES };
  }
  if (motorcar === "no") {
    return { status: "explicit_no", reason_code: TollReason.MOTORCAR_NO };
  }

  // `toll=yes` combined with an explicit motorcar=no exemption wins.
  if (generic === "yes" && motorcar === undefined && tags["toll:motorcar"] === "no") {
    return {
      status: "explicit_no",
      reason_code: TollReason.GENERIC_YES_BUT_MOTORCAR_NO,
    };
  }

  // Conditional handling: applies only if it concerns cars or is generic.
  if (conditionalTags.length > 0) {
    const relevant = conditionalTags.filter(([k]) => {
      if (k === "toll:conditional") return true;
      if (k === "toll:motorcar:conditional") return true;
      if (k === "toll:motor_vehicle:conditional") return true;
      return false;
    });
    if (relevant.length > 0) {
      const conditions = relevant.flatMap(([, v]) => parseCondition(v, parseWhen));
      return {
        status: "conditional",
        reason_code: TollReason.CONDITIONAL,
        conditions,
      };
    }
  }

  // Generic toll=yes with no per-vehicle override → treated as applicable to cars.
  if (generic === "yes") {
    return { status: "explicit_yes", reason_code: TollReason.GENERIC_YES };
  }

  // toll:motor_vehicle=yes (and no motorcar=no override above).
  if (motorVehicle === "yes") {
    return { status: "explicit_yes", reason_code: TollReason.MOTOR_VEHICLE_YES };
  }

  // Only HGV is tolled and no info about cars → not relevant for a car map.
  if (tags["toll:hgv"] === "yes" && motorcar === undefined && generic === undefined && motorVehicle === undefined) {
    return { status: "unknown", reason_code: null };
  }

  // No relevant tags — segment is not part of the toll layer.
  return { status: "unknown", reason_code: null };
}
