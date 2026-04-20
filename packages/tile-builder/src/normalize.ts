#!/usr/bin/env node
/**
 * Stream GeoJSONSeq from osmium → enriched GeoJSONSeq for tippecanoe.
 *
 * Input (stdin):  one GeoJSON Feature per line, properties = raw OSM tags,
 *                 plus osmium-injected `@id`, `@type`.
 * Output (stdout): one GeoJSON Feature per line with normalized properties:
 *                  osm_type, osm_id, toll_status, toll_reason,
 *                  chains_status, chains_reason.
 *
 * Features that produce `unknown` for BOTH layers are dropped.
 *
 * Counts are written to stderr on completion.
 *
 * Usage:
 *   npx tsx packages/tile-builder/src/normalize.ts < raw.geojsonseq > enriched.geojsonseq
 */

import { createInterface } from "node:readline";
import { stdin, stdout, stderr, exit } from "node:process";
import { interpretToll, interpretChains, interpretSeasonal } from "@mmt/interpreter";
import type { TileProperties } from "@mmt/model";

// opening_hours is heavy and may have CJS interop issues.
// For the MVP we don't need to actually parse the temporal conditions into
// an AST at build time — we only need to recognize their presence (which
// the interpreter already does by checking key names). So we use a no-op
// parseWhen that just marks the raw expression without importing the lib.
function parseWhen(expr: string): unknown {
  return { raw: expr };
}

interface InputFeature {
  type: "Feature";
  id?: string | number;
  geometry: unknown;
  properties: Record<string, string | number> & {
    "@id"?: string | number;
    "@type"?: string;
  };
}

const counters = {
  total: 0,
  emitted: 0,
  parseErrors: 0,
  toll: { explicit_yes: 0, explicit_no: 0, conditional: 0, ambiguous: 0, unknown: 0 },
  chains: { explicit: 0, conditional: 0, ambiguous: 0, unknown: 0 },
  seasonal: { winter_closure: 0, winter_only_road: 0, unknown: 0 },
};

// Highway classes that never carry cars — dropped before any tag analysis.
const NON_CAR_HIGHWAYS = new Set([
  "footway", "path", "pedestrian", "steps", "cycleway", "bridleway",
  "corridor", "platform", "via_ferrata", "elevator", "escalator",
  // Not-yet-built or decommissioned roads.
  "proposed", "construction", "planned", "abandoned", "disused",
]);

stderr.write("[normalize] starting…\n");

try {
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    // GeoJSONSeq (RFC 8142) prefixes each record with ASCII Record
    // Separator 0x1E. Strip it (and any other whitespace) before parsing.
    const cleaned = line.replace(/^\x1e/, "").trim();
    if (!cleaned) continue;
    counters.total++;
    let feat: InputFeature;
    try {
      feat = JSON.parse(cleaned);
    } catch {
      counters.parseErrors++;
      continue;
    }

    const rawProps = feat.properties ?? {};

    // osmium export --add-unique-id=type_id puts the OSM id as Feature.id
    // in the format "w12345" (way) or "r12345" (relation).
    // Parse that into separate type + numeric id.
    let osmType: "way" | "relation" | "node" = "way";
    let osmId = 0;
    const featId = feat.id ?? rawProps["@id"];
    if (typeof featId === "string") {
      if (featId.startsWith("r")) {
        osmType = "relation";
        osmId = parseInt(featId.slice(1), 10) || 0;
      } else if (featId.startsWith("w")) {
        osmType = "way";
        osmId = parseInt(featId.slice(1), 10) || 0;
      } else if (featId.startsWith("n")) {
        osmType = "node";
        osmId = parseInt(featId.slice(1), 10) || 0;
      }
    } else if (typeof featId === "number") {
      osmId = featId;
    }

    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawProps)) {
      if (k.startsWith("@")) continue;
      if (typeof v === "string") tags[k] = v;
      else if (typeof v === "number") tags[k] = String(v);
    }

    // Log first feature for debugging in CI
    if (counters.total === 1) {
      stderr.write(`[normalize] first feature id: ${JSON.stringify(feat.id)}\n`);
      stderr.write(`[normalize] first feature keys: ${JSON.stringify(Object.keys(rawProps))}\n`);
    }

    // Hard gate: must be a road (highway=*), a ferry (route=ferry),
    // a low-emission zone polygon, or a toll-booth node.
    const isHighway   = typeof tags["highway"] === "string" && tags["highway"] !== "";
    const isFerry     = tags["route"] === "ferry";
    // Accept both the canonical boundary= tag and the secondary
    // low_emission_zone=yes that some mappers use on its own.
    const isLEZ       = tags["boundary"] === "low_emission_zone"
                     || tags["low_emission_zone"] === "yes";
    const isTollBooth = osmType === "node"
                     && (tags["barrier"] === "toll_booth"
                      || tags["highway"] === "toll_gantry");
    if (!isHighway && !isFerry && !isLEZ && !isTollBooth) continue;

    // Toll booth nodes → emit immediately as a point feature and move on.
    if (isTollBooth) {
      const props: TileProperties = {
        osm_type: "node",
        osm_id: osmId,
        kind: "toll_point",
      };
      stdout.write(
        JSON.stringify({ type: "Feature", geometry: feat.geometry, properties: props }) + "\n",
      );
      counters.emitted++;
      continue;
    }

    // LEZ: emit as a polygon feature with a discriminator and bail out
    // before any toll/chains/ferry interpretation runs.
    if (isLEZ) {
      const lezProps: TileProperties = {
        osm_type: osmType,
        osm_id: osmId,
        kind: "lez",
        name: tags["name"] ?? "",
      };
      stdout.write(
        JSON.stringify({ type: "Feature", geometry: feat.geometry, properties: lezProps }) + "\n",
      );
      counters.emitted++;
      continue;
    }

    // Drop non-car highway classes outright (defined above the loop).
    if (isHighway && NON_CAR_HIGHWAYS.has(tags["highway"]!)) continue;

    // Drop roads with no public car access — private driveways, gated
    // roads, etc. LEZ polygons are already handled above and skipped here.
    const accessVal = tags["access"];
    if (accessVal === "private" || accessVal === "no") continue;

    const toll     = interpretToll(tags, parseWhen);
    const chains   = interpretChains(tags, parseWhen);
    const seasonal = interpretSeasonal(tags);
    counters.toll[toll.status]++;
    counters.chains[chains.status]++;
    counters.seasonal[seasonal.status]++;

    // Ferry: require *positive confirmation* that the ferry carries cars.
    // route=ferry alone is not enough — many ferries are foot/bike-only
    // and OSM mappers don't always tag the negative case. We accept any
    // of: motor_vehicle=yes, motorcar=yes, motor_vehicle=designated,
    // motorcar=designated, or vehicle=yes (umbrella).
    const isFerryRoute = tags["route"] === "ferry";
    const allowsCars =
         tags["motor_vehicle"] === "yes" || tags["motor_vehicle"] === "designated"
      || tags["motorcar"]      === "yes" || tags["motorcar"]      === "designated"
      || tags["vehicle"]       === "yes" || tags["vehicle"]       === "designated";
    const carsBlocked  = tags["access"] === "no"
                      || tags["vehicle"] === "no"
                      || tags["motor_vehicle"] === "no"
                      || tags["motorcar"] === "no";
    const ferryOk = isFerryRoute && allowsCars && !carsBlocked;

    // Ferries never belong in the toll layer, even if they don't pass the
    // strict ferry-qualification check (no motor_vehicle=yes etc.). A
    // route=ferry tagged toll=yes without car-access info is just an
    // unqualified ferry — drop it from toll, not promote it to a road.
    const tollIncluded     = !isFerryRoute && toll.status !== "unknown";
    const chainsIncluded   = chains.status !== "unknown";
    const seasonalIncluded = !isFerryRoute && seasonal.status !== "unknown";
    if (!tollIncluded && !chainsIncluded && !ferryOk && !seasonalIncluded) continue;

    const outProps: TileProperties & { ferry_car?: boolean } = {
      osm_type: osmType,
      osm_id: osmId,
      ...(tollIncluded && {
        toll_status: toll.status,
        toll_reason: toll.reason_code ?? "",
      }),
      ...(chainsIncluded && {
        chains_status: chains.status,
        chains_reason: chains.reason_code ?? "",
      }),
      ...(seasonalIncluded && {
        seasonal_status: seasonal.status,
        seasonal_reason: seasonal.reason_code ?? "",
        ...(seasonal.months && seasonal.months.length > 0 && {
          seasonal_months: seasonal.months.join(","),
        }),
      }),
      ...(ferryOk && { ferry_car: true }),
    };

    stdout.write(
      JSON.stringify({ type: "Feature", geometry: feat.geometry, properties: outProps }) + "\n",
    );
    counters.emitted++;

    // Progress every 100k features
    if (counters.total % 100_000 === 0) {
      stderr.write(`[normalize] processed ${counters.total}, emitted ${counters.emitted}\n`);
    }
  }
} catch (err) {
  stderr.write(`[normalize] FATAL ERROR: ${err}\n`);
  exit(1);
}

stderr.write(
  `[normalize] DONE total=${counters.total} emitted=${counters.emitted} parseErrors=${counters.parseErrors}\n` +
    `  toll: ${JSON.stringify(counters.toll)}\n` +
    `  chains: ${JSON.stringify(counters.chains)}\n` +
    `  seasonal: ${JSON.stringify(counters.seasonal)}\n`,
);

if (counters.emitted === 0 && counters.total > 0) {
  stderr.write("[normalize] WARNING: 0 features emitted out of " + counters.total + " — check tag interpretation\n");
}
