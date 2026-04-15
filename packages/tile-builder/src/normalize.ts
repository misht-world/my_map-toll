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
 *   osmium export filtered.osm.pbf -f geojsonseq \
 *     | node packages/tile-builder/src/normalize.ts \
 *     > enriched.geojsonseq
 */

import { createInterface } from "node:readline";
import { stdin, stdout, stderr } from "node:process";
import { interpretToll, interpretChains } from "@mmt/interpreter";
import opening_hours from "opening_hours";
import type { TileProperties } from "@mmt/model";

// opening_hours is CJS; default export is the constructor
const OpeningHours = (opening_hours as unknown as {
  default?: typeof opening_hours;
}).default ?? opening_hours;

function parseWhen(expr: string): unknown {
  // Wrap so we return a serializable marker rather than the live instance.
  // Tile consumers do not need the AST — tiles only carry status + reason.
  // We still invoke the parser to validate the expression; failures bubble up
  // to parseCondition which catches them and stores when: null.
  // eslint-disable-next-line @typescript-eslint/no-new
  new (OpeningHours as unknown as new (s: string) => unknown)(expr);
  return { parsed: true, expr };
}

interface InputFeature {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, string> & { "@id"?: string | number; "@type"?: string };
}

const counters = {
  total: 0,
  emitted: 0,
  toll: { explicit_yes: 0, explicit_no: 0, conditional: 0, ambiguous: 0, unknown: 0 },
  chains: { explicit: 0, conditional: 0, ambiguous: 0, unknown: 0 },
};

const rl = createInterface({ input: stdin, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  counters.total++;
  let feat: InputFeature;
  try {
    feat = JSON.parse(line);
  } catch {
    continue;
  }

  const rawProps = feat.properties ?? {};
  // Extract osmium meta and strip it from the tag bag passed to the interpreter.
  const osmIdRaw = rawProps["@id"];
  const osmTypeRaw = rawProps["@type"];
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (k.startsWith("@")) continue;
    if (typeof v === "string") tags[k] = v;
  }

  const toll = interpretToll(tags, parseWhen);
  const chains = interpretChains(tags, parseWhen);
  counters.toll[toll.status]++;
  counters.chains[chains.status]++;

  const tollIncluded = toll.status !== "unknown";
  const chainsIncluded = chains.status !== "unknown";
  if (!tollIncluded && !chainsIncluded) continue;

  const osmType =
    osmTypeRaw === "relation" ? "relation" : "way";
  const osmId =
    typeof osmIdRaw === "number"
      ? osmIdRaw
      : typeof osmIdRaw === "string"
      ? Number.parseInt(osmIdRaw, 10)
      : 0;

  const outProps: TileProperties = {
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
  };

  stdout.write(
    JSON.stringify({ type: "Feature", geometry: feat.geometry, properties: outProps }) + "\n",
  );
  counters.emitted++;
}

stderr.write(
  `[normalize] total=${counters.total} emitted=${counters.emitted}\n` +
    `  toll: ${JSON.stringify(counters.toll)}\n` +
    `  chains: ${JSON.stringify(counters.chains)}\n`,
);
