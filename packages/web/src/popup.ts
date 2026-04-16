import type { TileProperties } from "@mmt/model";
import { config } from "./config.js";

const STATUS_LABELS: Record<string, string> = {
  explicit_yes: "Yes — explicitly tolled",
  explicit_no:  "No — explicitly free",
  conditional:  "Conditional (time/season rules in OSM)",
  ambiguous:    "Ambiguous — incomplete OSM data",
  explicit:     "Required",
};

export function renderPopup(props: TileProperties): HTMLElement {
  const root = document.createElement("div");
  root.className = "popup";

  const lines: string[] = [];

  if (props.toll_status && props.toll_status !== "unknown") {
    const label = STATUS_LABELS[props.toll_status] ?? props.toll_status;
    lines.push(
      `<div class="popup-status">💰 Toll: ${escapeHtml(label)}</div>` +
      `<div class="popup-reason">${escapeHtml(props.toll_reason ?? "")}</div>`,
    );
  }

  if (props.chains_status && props.chains_status !== "unknown") {
    const label = STATUS_LABELS[props.chains_status] ?? props.chains_status;
    lines.push(
      `<div class="popup-status">⛓ Chains: ${escapeHtml(label)}</div>` +
      `<div class="popup-reason">${escapeHtml(props.chains_reason ?? "")}</div>`,
    );
  }

  const hasValidId = props.osm_id && props.osm_id !== 0;

  if (hasValidId) {
    // Show raw tags section and OSM link only when we have a real ID
    lines.push(
      `<div class="popup-tags" data-role="tags"><em>Loading OSM tags…</em></div>`,
      `<a class="popup-link"
          href="https://www.openstreetmap.org/${props.osm_type}/${props.osm_id}"
          target="_blank" rel="noopener">Open on openstreetmap.org ↗</a>`,
    );
  } else {
    lines.push(
      `<div class="hint" style="margin-top:6px">OSM ID not available in current tiles.<br>Rebuild data to see raw tags.</div>`,
    );
  }

  root.innerHTML = lines.join("");

  if (hasValidId) {
    const tagsEl = root.querySelector<HTMLElement>('[data-role="tags"]');
    if (tagsEl) {
      fetchRawTags(props.osm_type ?? "way", props.osm_id)
        .then((tags) => { tagsEl.innerHTML = renderTagsTable(tags); })
        .catch(() => { tagsEl.innerHTML = ""; }); // silently hide on error
    }
  }

  return root;
}

async function fetchRawTags(
  osmType: string,
  osmId: number,
): Promise<Record<string, string>> {
  const query = `[out:json][timeout:10];${osmType}(${osmId});out tags;`;
  const resp = await fetch(config.overpassUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`overpass ${resp.status}`);
  const json = (await resp.json()) as {
    elements?: Array<{ tags?: Record<string, string> }>;
  };
  return json.elements?.[0]?.tags ?? {};
}

function renderTagsTable(tags: Record<string, string>): string {
  const keys = Object.keys(tags).sort();
  if (keys.length === 0) return "";
  const rows = keys
    .map((k) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(tags[k] ?? "")}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
