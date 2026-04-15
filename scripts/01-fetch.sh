#!/usr/bin/env bash
# Fetch the latest Europe OSM extract from Geofabrik.
#
# Output: data/europe-latest.osm.pbf
#
# Geofabrik updates extracts daily. We download the .pbf alongside its md5
# and verify the hash — if the local file is already up-to-date, we skip
# the download.
set -euo pipefail

DATA_DIR="${DATA_DIR:-data}"
URL="${GEOFABRIK_URL:-https://download.geofabrik.de/europe-latest.osm.pbf}"
MD5_URL="${URL}.md5"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

echo "[fetch] downloading md5 from ${MD5_URL}"
curl -sSL -o europe-latest.osm.pbf.md5 "$MD5_URL"

if [[ -f europe-latest.osm.pbf ]]; then
  if md5sum -c europe-latest.osm.pbf.md5 >/dev/null 2>&1; then
    echo "[fetch] local extract already up-to-date, skipping download"
    exit 0
  else
    echo "[fetch] local extract outdated, re-downloading"
  fi
fi

echo "[fetch] downloading ${URL}"
curl -L --fail -o europe-latest.osm.pbf "$URL"
md5sum -c europe-latest.osm.pbf.md5
echo "[fetch] done: $(du -h europe-latest.osm.pbf | cut -f1)"
