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
curl -sSL -o europe-latest.osm.pbf.md5.raw "$MD5_URL"
# Geofabrik's .md5 references the dated filename (e.g. europe-260414.osm.pbf),
# but we save locally as europe-latest.osm.pbf. Rewrite the filename column
# so md5sum -c works against our local name.
EXPECTED_HASH="$(awk '{print $1}' europe-latest.osm.pbf.md5.raw)"
echo "${EXPECTED_HASH}  europe-latest.osm.pbf" > europe-latest.osm.pbf.md5

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
