import type { TileProperties } from "@mmt/model";
import { config } from "./config.js";

/**
 * Build the HTML for a feature popup. Raw OSM tags are fetched lazily
 * from Overpass by osm_id — tiles themselves only carry the normalized
 * fields, which keeps them small.
 */

export function renderPopup(props: TileProperties): HTMLElement {
  const root = document.createElement("div");
  root.className = "popup";

  const lines: string[] = [];
  if (props.toll_status) {
    lines.push(
      `<div class="popup-status">Toll: ${escapeHtml(props.toll_status)}</div>` +
        `<div class="popup-reason">${escapeHtml(props.toll_reason ?? "")}</div>`,
    );
  }
  if (props.chains_status) {
    lines.push(
      `<div class="popup-status">Chains: ${escapeHtml(props.chains_status)}</div>` +
        `<div class="popup-reason">${escapeHtml(props.chains_reason ?? "")}</div>`,
    );
  }

  const osmLink = `https://www.openstreetmap.org/${props.osm_type}/${props.osm_id}`;
  lines.push(
    `<div class="popup-tags" data-role="tags"><em>Loading raw OSM tags…</em></div>`,
    `<a class="popup-link" href="${osmLink}" target="_blank" rel="noopener">Open on openstreetmap.org ↗</a>`,
  );

  root.innerHTML = lines.join("");

  // Kick off the lazy fetch; update the element when it resolves.
  const tagsEl = root.querySelector<HTMLElement>('[data-role="tags"]');
  if (tagsEl) {
    fetchRawTags(props.osm_type, props.osm_id)
      .then((tags) => {
        tagsEl.innerHTML = renderTagsTable(tags);
      })
      .catch(() => {
        tagsEl.innerHTML =
          '<em>Failed to load raw tags from Overpass.</em>';
      });
  }

  return root;
}

async function fetchRawTags(
  osmType: "way" | "relation",
  osmId: number,
): Promise<Record<string, string>> {
  const query = `[out:json][timeout:10];${osmType}(${osmId});out tags;`;
  const resp = await fetch(config.overpassUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!resp.ok) throw new Error(`overpass ${resp.status}`);
  const json = (await resp.json()) as {
    elements?: Array<{ tags?: Record<string, string> }>;
  };
  return json.elements?.[0]?.tags ?? {};
}

function renderTagsTable(tags: Record<string, string>): string {
  const keys = Object.keys(tags).sort();
  if (keys.length === 0) return "<em>No tags returned.</em>";
  const rows = keys
    .map(
      (k) =>
        `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(tags[k] ?? "")}</td></tr>`,
    )
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
