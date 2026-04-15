#!/usr/bin/env bash
# Normalize filtered OSM data and build PMTiles.
#
# Requires: osmium-tool, tippecanoe, pmtiles (go-pmtiles CLI), node 20+.
#
# Input:  data/europe-filtered.osm.pbf
# Output: data/europe-overlay.pmtiles
set -euo pipefail

DATA_DIR="${DATA_DIR:-data}"
IN="$DATA_DIR/europe-filtered.osm.pbf"
GEOJSONSEQ="$DATA_DIR/europe-enriched.geojsonseq"
MBTILES="$DATA_DIR/europe-overlay.mbtiles"
PMTILES="$DATA_DIR/europe-overlay.pmtiles"

if [[ ! -f "$IN" ]]; then
  echo "[tile] missing $IN — run scripts/02-filter.sh first" >&2
  exit 1
fi

echo "[tile] normalizing tags → enriched GeoJSONSeq"
osmium export "$IN" -f geojsonseq --overwrite \
  | node --experimental-strip-types packages/tile-builder/src/normalize.ts \
  > "$GEOJSONSEQ"

echo "[tile] tippecanoe → mbtiles"
# Layer name 'restrictions' is referenced by the web style.
# -Z0 / -z12 keeps tiles small; at z>=12 details become visible while map
# stays performant. Attribute filtering keeps only our normalized fields.
tippecanoe \
  --force \
  --layer=restrictions \
  --minimum-zoom=3 \
  --maximum-zoom=12 \
  --drop-densest-as-needed \
  --coalesce-densest-as-needed \
  --read-parallel \
  --no-tile-size-limit \
  --attribute-type=osm_id:int \
  -o "$MBTILES" \
  "$GEOJSONSEQ"

echo "[tile] mbtiles → pmtiles"
pmtiles convert --force "$MBTILES" "$PMTILES"
rm -f "$MBTILES"

echo "[tile] done: $(du -h "$PMTILES" | cut -f1)"
