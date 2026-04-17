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
import { interpretToll, interpretChains } from "@mmt/interpreter";
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
};

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
    let osmType: "way" | "relation" = "way";
    let osmId = 0;
    const featId = feat.id ?? rawProps["@id"];
    if (typeof featId === "string") {
      if (featId.startsWith("r")) {
        osmType = "relation";
        osmId = parseInt(featId.slice(1), 10) || 0;
      } else if (featId.startsWith("w")) {
        osmType = "way";
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

    const toll   = interpretToll(tags, parseWhen);
    const chains = interpretChains(tags, parseWhen);
    counters.toll[toll.status]++;
    counters.chains[chains.status]++;

    // Ferry: route=ferry, but exclude ferries where cars clearly aren't
    // allowed (e.g. bike/foot-only ferries tagged vehicle=no, motor_vehicle=no,
    // motorcar=no, or access=no). Other route=ferry ways are assumed to
    // carry cars — it's by far the common case in OSM.
    const isFerryRoute = tags["route"] === "ferry";
    const carsBlocked  = tags["access"] === "no"
                      || tags["vehicle"] === "no"
                      || tags["motor_vehicle"] === "no"
                      || tags["motorcar"] === "no";
    const ferryOk = isFerryRoute && !carsBlocked;

    const tollIncluded   = !ferryOk && toll.status !== "unknown";
    const chainsIncluded = chains.status !== "unknown";
    if (!tollIncluded && !chainsIncluded && !ferryOk) continue;

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
    `  chains: ${JSON.stringify(counters.chains)}\n`,
);

if (counters.emitted === 0 && counters.total > 0) {
  stderr.write("[normalize] WARNING: 0 features emitted out of " + counters.total + " — check tag interpretation\n");
}
