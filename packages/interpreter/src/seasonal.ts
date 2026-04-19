import {
  type OsmTags,
  type SeasonalResult,
  SeasonalReason,
} from "@mmt/model";

/**
 * Seasonal road closures — primarily mountain passes and ice/winter roads.
 *
 * Detection rules:
 * 1. `seasonal=winter` → the road only exists/is passable in winter
 *    (Nordic ice roads, winter-only tracks). Status: `winter_only_road`.
 * 2. `motor_vehicle:conditional`, `vehicle:conditional`, `access:conditional`
 *    containing a `no @ (...winter months...)` clause → standard alpine-pass
 *    closed-for-winter case. Status: `winter_closure`.
 *
 * We deliberately do NOT trigger on `winter_road=yes` here — that tag is
 * about chain requirements, handled by `interpretChains`.
 */

const ALL_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WINTER_MONTHS = new Set(["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"]);

const CONDITIONAL_KEYS = [
  "motor_vehicle:conditional",
  "vehicle:conditional",
  "access:conditional",
  "motorcar:conditional",
];

/**
 * Pull month tokens out of a free-text condition expression. Handles bare
 * tokens (`Nov`), ranges (`Nov-Apr`), and ranges that wrap year-end
 * (`Nov-Apr` → Nov, Dec, Jan, Feb, Mar, Apr).
 */
function extractMonths(s: string): string[] {
  const found = new Set<string>();
  const monthRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;
  let m: RegExpExecArray | null;
  while ((m = monthRe.exec(s)) !== null) found.add(m[1]!);

  // Allow optional day-of-month between the month name and the dash, so
  // patterns like "Nov 1-Apr 30" are handled the same as "Nov-Apr".
  const rangeRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+\d+)?\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+\d+)?\b/g;
  while ((m = rangeRe.exec(s)) !== null) {
    const a = ALL_MONTHS.indexOf(m[1]!);
    const b = ALL_MONTHS.indexOf(m[2]!);
    if (a < 0 || b < 0) continue;
    let i = a;
    // Walk forward, wrapping through Dec→Jan, until we land on b.
    for (let safety = 0; safety < 13; safety++) {
      found.add(ALL_MONTHS[i]!);
      if (i === b) break;
      i = (i + 1) % 12;
    }
  }
  // Preserve calendar order in the output for stable test assertions.
  return ALL_MONTHS.filter((m) => found.has(m));
}

export function interpretSeasonal(tags: OsmTags): SeasonalResult {
  // Winter-only roads (e.g. ice crossings).
  if (tags["seasonal"] === "winter") {
    return {
      status: "winter_only_road",
      reason_code: SeasonalReason.SEASONAL_WINTER,
    };
  }

  for (const key of CONDITIONAL_KEYS) {
    const v = tags[key];
    if (!v) continue;

    // Find any "no @ (...)" clause.
    const noAt = /\bno\s*@\s*\(([^)]+)\)/i.exec(v);
    if (!noAt) continue;

    const months = extractMonths(noAt[1]!);
    const winter = months.filter((m) => WINTER_MONTHS.has(m));

    // Require at least two winter months — guards against false positives
    // like a single-day November closure for an event.
    if (winter.length >= 2) {
      return {
        status: "winter_closure",
        reason_code: SeasonalReason.CONDITIONAL_WINTER_NO,
        months,
        raw: v,
      };
    }
  }

  return { status: "unknown", reason_code: null };
}
