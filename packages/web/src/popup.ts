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

  if (props.kind === "toll_point") {
    lines.push(
      `<div class="popup-status">💰 Toll booth / gantry</div>`,
      `<div class="popup-reason">Toll collection point. The road through here is likely tolled — check local tariff signs.</div>`,
    );
  }

  if (props.kind === "border_control") {
    const name = (props.name && props.name.length > 0) ? props.name : "Border control";
    lines.push(
      `<div class="popup-status">🛂 ${escapeHtml(name)}</div>`,
      `<div class="popup-reason">Border crossing point. Carry valid travel documents; visa requirements depend on your citizenship.</div>`,
    );
  }

  if (props.kind === "lez") {
    const name = (props.name && props.name.length > 0) ? props.name : "Low emission zone";
    const subtype = detectLezSubtype(name);
    lines.push(
      `<div class="popup-status">🌿 ${escapeHtml(name)}</div>`,
    );
    if (subtype) {
      lines.push(`<div class="popup-reason"><strong>${escapeHtml(subtype.label)}</strong> — ${escapeHtml(subtype.hint)}</div>`);
    } else {
      lines.push(`<div class="popup-reason">Low emission / restricted-access zone. Check local rules — vehicle class limits, hours, permits may apply.</div>`);
    }
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
  if ((props as Record<string, unknown>)["car_shuttle"]) {
    lines.push(
      `<div class="popup-status">🚂 Car-shuttle train / tunnel</div>`,
      `<div class="popup-reason">Drive your car onto the train or through the tunnel. Check timetable and booking before travel.</div>`,
    );
  }
  if (props.seasonal_status && props.seasonal_status !== "unknown") {
    const label = props.seasonal_status === "winter_only_road"
      ? "Winter-only road (e.g. ice road / winter track)"
      : "Closed for the winter season";
    lines.push(`<div class="popup-status">❄️ ${escapeHtml(label)}</div>`);
    if (props.seasonal_months) {
      const verb = props.seasonal_status === "winter_only_road" ? "Open in" : "Closed in";
      lines.push(`<div class="popup-reason">${verb}: ${escapeHtml(props.seasonal_months)}. Verify with local sources before travel.</div>`);
    }
  }

  const hasValidId = props.osm_id && props.osm_id !== 0;
  const lat = lngLat.lat.toFixed(6);
  const lng = lngLat.lng.toFixed(6);

  // Placeholder for Name + source links (website/wikipedia/etc.),
  // populated after the Overpass fetch completes.
  lines.push(`<div class="popup-meta" data-role="meta"></div>`);

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
    // Collapsed by default — the raw tag dump is noisy and mostly for
    // power users. The interesting stuff (name, source links) is hoisted
    // into .popup-meta above.
    lines.push(
      `<details class="popup-tags" data-role="tags-details">` +
      `<summary>All OSM tags</summary>` +
      `<div data-role="tags"><em>Loading tags…</em></div>` +
      `</details>`,
    );
  }

  root.innerHTML = lines.join("");

  if (hasValidId) {
    const tagsEl  = root.querySelector<HTMLElement>('[data-role="tags"]');
    const detailsEl = root.querySelector<HTMLElement>('[data-role="tags-details"]');
    const metaEl  = root.querySelector<HTMLElement>('[data-role="meta"]');
    if (tagsEl) {
      fetchRawTags(props.osm_type ?? "way", props.osm_id)
        .then((tags) => {
          // Refine LEZ subtype classification using fetched tags — many
          // city-zone specifics live in description=*, note=*, etc.
          if (props.kind === "lez") {
            const corpus = [tags.name, tags["name:en"], tags.description, tags.note, tags.operator]
              .filter(Boolean).join(" ");
            const sub = detectLezSubtype(corpus);
            if (sub) {
              const reasonEl = root.querySelector<HTMLElement>(".popup-reason");
              if (reasonEl) {
                reasonEl.innerHTML = `<strong>${escapeHtml(sub.label)}</strong> — ${escapeHtml(sub.hint)}`;
              }
            }
          }
          // Hoist name + source links (website/wikipedia/etc.) above the
          // collapsible tag dump. LEZ already shows name in the status
          // badge, so skip it there.
          if (metaEl) {
            metaEl.innerHTML = renderMeta(tags, props.kind === "lez");
            if (!metaEl.innerHTML) metaEl.remove();
          }
          tagsEl.innerHTML = renderTagsTable(tags);
          if (!tagsEl.innerHTML) detailsEl?.remove();
        })
        .catch(() => detailsEl?.remove()); // silently hide on error
    }
  }

  return root;
}

/**
 * Pull out user-facing identity + reference links from OSM tags:
 *   - name (skipped if we already show it in the status badge)
 *   - website / url / contact:website
 *   - wikipedia / wikidata (rendered as Wikipedia link)
 *   - operator name (not as a link, as context)
 */
function renderMeta(tags: Record<string, string>, skipName: boolean): string {
  const parts: string[] = [];

  const name = tags.name ?? tags["name:en"];
  if (name && !skipName) {
    parts.push(`<div class="popup-name">${escapeHtml(name)}</div>`);
  }

  const operator = tags.operator;
  if (operator) {
    parts.push(`<div class="popup-operator">Operator: ${escapeHtml(operator)}</div>`);
  }

  const links: string[] = [];
  const web = tags.website ?? tags.url ?? tags["contact:website"];
  if (web && /^https?:\/\//i.test(web)) {
    links.push(`<a class="popup-link" href="${escapeHtml(web)}" target="_blank" rel="noopener">Official website ↗</a>`);
  }
  const wiki = tags.wikipedia;
  if (wiki) {
    // Format "lang:Title" → https://lang.wikipedia.org/wiki/Title
    const m = /^([a-z]{2,3}):(.+)$/.exec(wiki);
    const href = m
      ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2]!.replace(/ /g, "_"))}`
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, "_"))}`;
    links.push(`<a class="popup-link" href="${href}" target="_blank" rel="noopener">Wikipedia ↗</a>`);
  }
  if (links.length) {
    parts.push(`<div class="popup-sources">${links.join("")}</div>`);
  }

  return parts.join("");
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

// ---------------------------------------------------------------------------
// Tag humanization
//
// Renders raw OSM tags in a more readable form: translates known keys and
// values to English labels, parses conditional syntax, appends units to
// numeric limits. Keys we don't recognise are shown as-is so nothing is
// lost. The original key is kept in a `title` attribute so power users can
// still inspect it on hover.
// ---------------------------------------------------------------------------

const KEY_LABELS: Record<string, string> = {
  name: "Name",
  "name:en": "Name (EN)",
  ref: "Road number",
  highway: "Road class",
  surface: "Surface",
  operator: "Operator",
  website: "Website",
  note: "Note",
  description: "Description",
  opening_hours: "Opening hours",

  // Access classes
  access: "Access",
  motor_vehicle: "Motor vehicles",
  motorcar: "Cars",
  vehicle: "Vehicles",
  hgv: "Trucks",
  bus: "Buses",
  psv: "Public transport",

  // Toll
  toll: "Toll",
  "toll:motorcar": "Toll — cars",
  "toll:motor_vehicle": "Toll — motor vehicles",
  "toll:hgv": "Toll — trucks",
  "toll:conditional": "Toll (conditional)",
  "toll:motorcar:conditional": "Toll — cars (conditional)",
  "toll:motor_vehicle:conditional": "Toll — motor veh. (conditional)",

  // Chains / winter
  snow_chains: "Snow chains",
  "snow_chains:conditional": "Snow chains (conditional)",
  winter_road: "Winter road",
  seasonal: "Seasonal",

  // Conditional access
  "access:conditional": "Access (conditional)",
  "motor_vehicle:conditional": "Motor vehicles (conditional)",
  "motorcar:conditional": "Cars (conditional)",
  "vehicle:conditional": "Vehicles (conditional)",
  "hgv:conditional": "Trucks (conditional)",

  // Limits
  maxspeed: "Max speed",
  maxweight: "Max weight",
  maxheight: "Max height",
  maxlength: "Max length",
  maxwidth: "Max width",
  maxaxleload: "Max axle load",

  // Zone / barrier
  boundary: "Boundary type",
  low_emission_zone: "Low emission zone",
  barrier: "Barrier",
};

const VALUE_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  permissive: "Permissive",
  private: "Private",
  destination: "Local destinations only",
  designated: "Designated",
  customers: "Customers only",
  delivery: "Delivery only",
  agricultural: "Agricultural only",
  forestry: "Forestry only",
  required: "Required",
  discouraged: "Discouraged",
  toll_booth: "Toll booth",
  toll_gantry: "Toll gantry",
  low_emission_zone: "Low emission zone",
  ferry: "Ferry",
};

// Order determines display order; unknown keys come after, sorted.
const KEY_ORDER = [
  "name", "name:en", "ref",
  "toll", "toll:motorcar", "toll:motor_vehicle", "toll:hgv",
  "toll:conditional", "toll:motorcar:conditional", "toll:motor_vehicle:conditional",
  "snow_chains", "snow_chains:conditional", "winter_road", "seasonal",
  "access", "motorcar", "motor_vehicle", "vehicle", "hgv",
  "access:conditional", "motorcar:conditional", "motor_vehicle:conditional",
  "vehicle:conditional", "hgv:conditional",
  "maxspeed", "maxweight", "maxheight", "maxlength", "maxwidth", "maxaxleload",
  "opening_hours", "operator", "website",
  "highway", "surface", "boundary", "low_emission_zone", "barrier",
  "note", "description",
];

/** Humanize a single tag value. `key` is used for unit-aware formatting. */
function humanizeValue(key: string, value: string): string {
  const trimmed = value.trim();

  // Multiple conditional clauses: "yes @ (Mo-Fr); no @ (Sa-Su)"
  if (trimmed.includes("@") && trimmed.includes(";")) {
    return trimmed.split(";").map(s => humanizeValue(key, s.trim())).join(" · ");
  }

  // Single conditional: "no @ (Nov 1-Apr 30)" → "No — Nov 1 – Apr 30"
  const cond = /^(\S+)\s*@\s*\(([^)]+)\)\s*$/.exec(trimmed);
  if (cond) {
    const v = VALUE_LABELS[cond[1]!] ?? cond[1]!;
    // Prettify inner range: hyphens between months/days → en-dash
    const when = cond[2]!.replace(/\s*-\s*/g, " – ");
    return `${v} — ${when}`;
  }

  // Numeric limits with implicit units
  if (key === "maxspeed" && /^\d+$/.test(trimmed))      return `${trimmed} km/h`;
  if (key === "maxspeed" && /^\d+\s*mph$/i.test(trimmed)) return trimmed.replace(/\s*mph/i, " mph");
  if ((key === "maxweight" || key === "maxaxleload") && /^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed} t`;
  if ((key === "maxheight" || key === "maxlength" || key === "maxwidth") && /^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed} m`;

  // Simple dictionary lookup
  return VALUE_LABELS[trimmed] ?? trimmed;
}

function orderKey(k: string): number {
  const i = KEY_ORDER.indexOf(k);
  return i === -1 ? 1000 : i;
}

function renderTagsTable(tags: Record<string, string>): string {
  const keys = Object.keys(tags).filter(k => !k.startsWith("@")).sort();
  if (!keys.length) return "";
  return `<table>${keys.map(k =>
    `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(tags[k] ?? "")}</td></tr>`
  ).join("")}</table>`;
}

/**
 * Best-effort classification of a low-emission zone from free text. Looks
 * at name/description/note/operator strings (in any European language) for
 * well-known programme keywords and returns a short label + plain-English
 * hint. Returns null if nothing is recognised.
 */
function detectLezSubtype(text: string): { label: string; hint: string } | null {
  const t = text.toLowerCase();
  // Order matters: more specific patterns first.
  if (/\bztl\b|zona\s+a\s+traffico\s+limitato/.test(t)) {
    return { label: "ZTL (Italy)",
      hint: "Limited-traffic zone, usually city centre. Entry by permit only during posted hours; cameras enforce." };
  }
  if (/\bzfe\b|zone\s+(?:à|a)\s+faibles\s+émissions/.test(t)) {
    return { label: "ZFE (France)",
      hint: "Low-emission zone. Crit'Air sticker required; older diesels/petrols restricted by class." };
  }
  if (/\bulez\b|ultra\s+low\s+emission/.test(t)) {
    return { label: "ULEZ (London)",
      hint: "Daily charge unless your vehicle meets Euro 4 (petrol) / Euro 6 (diesel)." };
  }
  if (/umweltzone|grüne\s+plakette/.test(t)) {
    return { label: "Umweltzone (Germany)",
      hint: "Green sticker (grüne Plakette) required to enter." };
  }
  if (/zero\s*[- ]?emission|nul[-\s]?emissie|emisiones?\s+cero/.test(t)) {
    return { label: "Zero-emission zone",
      hint: "Only fully electric / hydrogen vehicles allowed (often during posted hours)." };
  }
  if (/\bklass\s*3\b|miljözon\s*klass\s*3/.test(t)) {
    return { label: "Miljözon klass 3 (Sweden)",
      hint: "Strictest Swedish environmental zone — only zero-emission cars allowed." };
  }
  if (/\bklass\s*2\b|miljözon\s*klass\s*2/.test(t)) {
    return { label: "Miljözon klass 2 (Sweden)",
      hint: "Petrol Euro 5+ / diesel Euro 6+ required." };
  }
  if (/madrid\s+central|zbe|zona\s+de\s+bajas\s+emisiones/.test(t)) {
    return { label: "ZBE (Spain)",
      hint: "Low-emission zone. Spanish DGT environmental label (etiqueta) required." };
  }
  if (/zona\s+ograniczonej\s+emisji|sczt/.test(t)) {
    return { label: "Clean-transport zone (Poland)",
      hint: "SCZT — restricted to low-emission vehicles per local rules." };
  }
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
