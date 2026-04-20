#!/usr/bin/env bash
# Filter the raw OSM extract down to ways that carry restriction tags.
#
# Single-pass: toll* and snow_chains* tags appear almost exclusively on
# highway ways, so we skip the highway pre-filter and go straight to the
# restriction tags. One read of the PBF instead of two.
#
# Requires: osmium-tool
#
# Input:  data/europe-latest.osm.pbf
# Output: data/europe-filtered.osm.pbf
set -euo pipefail

DATA_DIR="${DATA_DIR:-data}"
IN="$DATA_DIR/europe-latest.osm.pbf"
OUT="$DATA_DIR/europe-filtered.osm.pbf"

if [[ ! -f "$IN" ]]; then
  echo "[filter] missing $IN — run scripts/01-fetch.sh first" >&2
  exit 1
fi

echo "[filter] single-pass osmium tags-filter"
osmium tags-filter --overwrite -o "$OUT" "$IN" \
  w/toll \
  w/toll:motorcar \
  w/toll:motor_vehicle \
  w/toll:hgv \
  w/toll:conditional \
  w/toll:motorcar:conditional \
  w/toll:motor_vehicle:conditional \
  w/snow_chains \
  w/snow_chains:conditional \
  w/winter_road \
  w/seasonal=winter \
  w/motor_vehicle:conditional \
  w/vehicle:conditional \
  w/access:conditional \
  w/motorcar:conditional \
  r/route=ferry \
  r/boundary=low_emission_zone \
  w/boundary=low_emission_zone \
  r/low_emission_zone=yes \
  w/low_emission_zone=yes \
  n/barrier=toll_booth \
  n/highway=toll_gantry

echo "[filter] done: $(du -h "$OUT" | cut -f1)"
