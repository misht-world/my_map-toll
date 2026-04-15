#!/usr/bin/env bash
# Filter the raw OSM extract down to road segments carrying any tag
# relevant to our layers. This dramatically reduces input size before
# normalization. Applied as two sequential filters because osmium's
# tags-filter treats multiple expressions as OR, not AND.
#
# Requires: osmium-tool (https://osmcode.org/osmium-tool/)
#
# Input:  data/europe-latest.osm.pbf
# Output: data/europe-filtered.osm.pbf
set -euo pipefail

DATA_DIR="${DATA_DIR:-data}"
IN="$DATA_DIR/europe-latest.osm.pbf"
MID="$DATA_DIR/europe-highways.osm.pbf"
OUT="$DATA_DIR/europe-filtered.osm.pbf"

if [[ ! -f "$IN" ]]; then
  echo "[filter] missing $IN — run scripts/01-fetch.sh first" >&2
  exit 1
fi

echo "[filter] step 1/2: highways only"
osmium tags-filter --overwrite -o "$MID" "$IN" w/highway

echo "[filter] step 2/2: restriction tags"
osmium tags-filter --overwrite -o "$OUT" "$MID" \
  toll \
  toll:motorcar \
  toll:motor_vehicle \
  toll:hgv \
  toll:conditional \
  toll:motorcar:conditional \
  toll:motor_vehicle:conditional \
  snow_chains \
  snow_chains:conditional \
  winter_road

rm -f "$MID"
echo "[filter] done: $(du -h "$OUT" | cut -f1)"
