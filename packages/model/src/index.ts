/**
 * Core data model for the road-restrictions map.
 *
 * The model is intentionally minimal but structured so that:
 *   - raw OSM tags remain the source of truth (kept separately, fetched lazily),
 *   - normalized statuses drive rendering,
 *   - conditional restrictions are stored as structured objects (not raw strings),
 *     ready to be evaluated against a calendar date by future routing / filter logic.
 */

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export type TollStatus =
  | "explicit_yes"
  | "explicit_no"
  | "conditional"
  | "ambiguous"
  | "unknown";

export type ChainsStatus =
  | "explicit"
  | "conditional"
  | "ambiguous"
  | "unknown";

/** Seasonal road closures (mainly mountain passes and ice/winter roads). */
export type SeasonalStatus =
  | "winter_closure"   // road is closed during winter months
  | "winter_only_road" // road exists/is passable only in winter (ice roads)
  | "unknown";

// ---------------------------------------------------------------------------
// Reason codes
//
// These codes are stable identifiers for *why* the interpreter assigned a
// particular status. They are embedded in tiles so the UI can show a short
// human-readable explanation in the popup, and so downstream consumers
// (routing, audits) can key off the reason rather than re-parsing tags.
// ---------------------------------------------------------------------------

export const TollReason = {
  MOTORCAR_YES: "toll:motorcar=yes",
  MOTORCAR_NO: "toll:motorcar=no",
  MOTOR_VEHICLE_YES: "toll:motor_vehicle=yes",
  GENERIC_YES: "toll=yes+no_vehicle_override",
  GENERIC_YES_BUT_MOTORCAR_NO: "toll=yes+toll:motorcar=no",
  CONDITIONAL: "toll*:conditional",
  HGV_ONLY_AMBIGUOUS: "toll:hgv=yes+no_motorcar_info",
} as const;
export type TollReasonCode = (typeof TollReason)[keyof typeof TollReason];

export const ChainsReason = {
  SNOW_CHAINS_REQUIRED: "snow_chains=required",
  SNOW_CHAINS_YES: "snow_chains=yes",
  CONDITIONAL: "snow_chains:conditional",
  WINTER_ROAD_AMBIGUOUS: "winter_road=yes+no_chains_info",
} as const;
export type ChainsReasonCode = (typeof ChainsReason)[keyof typeof ChainsReason];

export const SeasonalReason = {
  CONDITIONAL_WINTER_NO: "*:conditional=no @ winter",
  SEASONAL_WINTER: "seasonal=winter",
} as const;
export type SeasonalReasonCode = (typeof SeasonalReason)[keyof typeof SeasonalReason];

// ---------------------------------------------------------------------------
// Conditions
//
// `when` is intentionally `unknown`: it is produced by `opening_hours.js`
// (parsed AST / wrapper instance) at build time. We keep the original raw
// condition string for audit and for fallback parsing on the client.
// ---------------------------------------------------------------------------

export interface Condition {
  /** Structured representation of the temporal condition (opening_hours AST). */
  when: unknown;
  /** If the condition was scoped to specific vehicle classes, listed here. */
  vehicle_filter?: string[];
  /** Original, unparsed OSM condition string. Kept for traceability. */
  raw: string;
}

// ---------------------------------------------------------------------------
// Interpreter results
// ---------------------------------------------------------------------------

export interface TollResult {
  status: TollStatus;
  reason_code: TollReasonCode | null;
  conditions?: Condition[];
}

export interface ChainsResult {
  status: ChainsStatus;
  reason_code: ChainsReasonCode | null;
  conditions?: Condition[];
}

export interface SeasonalResult {
  status: SeasonalStatus;
  reason_code: SeasonalReasonCode | null;
  /** Three-letter month abbreviations affected, if detected (e.g. ["Nov","Dec","Jan","Feb","Mar","Apr"]). */
  months?: string[];
  /** Original conditional/seasonal tag value, for auditing. */
  raw?: string;
}

// ---------------------------------------------------------------------------
// Segment (logical; only a subset is actually embedded into vector tiles)
// ---------------------------------------------------------------------------

export interface Segment {
  osm_type: "way" | "relation";
  osm_id: number;
  toll_cars: TollResult;
  chains: ChainsResult;
}

/** Fields that are embedded into the overlay PMTiles. */
export interface TileProperties {
  osm_type: "way" | "relation" | "node";
  osm_id: number;
  toll_status?: TollStatus;
  toll_reason?: string;
  chains_status?: ChainsStatus;
  chains_reason?: string;
  seasonal_status?: SeasonalStatus;
  seasonal_reason?: string;
  /** Comma-separated month abbreviations of affected/closed period. */
  seasonal_months?: string;
  /** Discriminator for non-line features. */
  kind?: "lez" | "toll_point";
  /** OSM `name=*` tag, used by zone features (LEZ) for popup labels. */
  name?: string;
  /** True for car-capable ferries. */
  ferry_car?: boolean;
  /** True for car-shuttle trains / tunnels (e.g. Eurotunnel, ROLA, Autozug). */
  car_shuttle?: boolean;
}

export type OsmTags = Readonly<Record<string, string>>;
