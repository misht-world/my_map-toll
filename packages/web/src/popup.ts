import type { LngLat } from "maplibre-gl";
import type { TileProperties } from "@mmt/model";
import { config } from "./config.js";

const STATUS_LABELS: Record<string, string> = {
  explicit_yes: "Yes — tolled",
  explicit_no:  "No — free",
  conditional:  "Conditional (time/season rules)",
  ambiguous:    "Possible (incomplete OSM data)",
  explicit:     "Required",
};

export function renderPopup(props: TileProperties, lngLat: LngLat): HTMLElement {
  const root = document.createElement("div");
  root.className = "popup";
  const lines: string[] = [];

  if (props.kind === "lez") {
    const name = (props.name && props.name.length > 0) ? props.name : "Low emission zone";
    lines.push(
      `<div class="popup-status">🌿 ${escapeHtml(name)}</div>`,
      `<div class="popup-reason">Low emission / restricted-access zone. Check local rules — vehicle class limits, hours, permits may apply.</div>`,
    );
  }
  if (props.toll_status && props.toll_status !== "unknown") {
    lines.push(
      `<div class="popup-status">💰 Toll: ${escapeHtml(STATUS_LABELS[props.toll_status] ?? props.toll_status)}</div>`,
    );
  }
  if (props.chains_status && props.chains_status !== "unknown") {
    lines.push(
      `<div class="popup-status">⛓ Chains: ${escapeHtml(STATUS_LABELS[props.chains_status] ?? props.chains_status)}</div>`,
    );
  }
  if ((props as Record<string, unknown>)["ferry_car"]) {
    lines.push(`<div class="popup-status">⛴ Car ferry</div>`);
  }

  const hasValidId = props.osm_id && props.osm_id !== 0;
  const lat = lngLat.lat.toFixed(6);
  const lng = lngLat.lng.toFixed(6);

  // Google Maps link — always available from click coordinates
  lines.push(
    `<div class="popup-links">` +
    `<a class="popup-link" href="https://maps.google.com/?q=${lat},${lng}&z=15" target="_blank" rel="noopener">Open in Google Maps ↗</a>`,
  );

  if (hasValidId) {
    lines.push(
      `<a class="popup-link" href="https://www.openstreetmap.org/${props.osm_type}/${props.osm_id}" target="_blank" rel="noopener">Open on OpenStreetMap ↗</a>`,
    );
  }

  lines.push(`</div>`);

  if (hasValidId) {
    lines.push(`<div class="popup-tags" data-role="tags"><em>Loading tags…</em></div>`);
  }

  root.innerHTML = lines.join("");

  if (hasValidId) {
    const tagsEl = root.querySelector<HTMLElement>('[data-role="tags"]');
    if (tagsEl) {
      fetchRawTags(props.osm_type ?? "way", props.osm_id)
        .then((tags) => {
          tagsEl.innerHTML = renderTagsTable(tags);
          if (!tagsEl.innerHTML) tagsEl.remove();
        })
        .catch(() => tagsEl.remove()); // silently hide on error
    }
  }

  return root;
}

async function fetchRawTags(osmType: string, osmId: number): Promise<Record<string, string>> {
  const query = `[out:json][timeout:10];${osmType}(${osmId});out tags;`;
  const resp = await fetch(config.overpassUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = (await resp.json()) as { elements?: Array<{ tags?: Record<string, string> }> };
  return json.elements?.[0]?.tags ?? {};
}

function renderTagsTable(tags: Record<string, string>): string {
  const keys = Object.keys(tags).sort();
  if (!keys.length) return "";
  return `<table>${keys.map(k =>
    `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(tags[k] ?? "")}</td></tr>`
  ).join("")}</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
