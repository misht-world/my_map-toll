import type { Condition } from "@mmt/model";

/**
 * OSM conditional syntax: "<value> @ <condition>; <value> @ <condition>; ..."
 * Example: `yes @ (Nov 01-Apr 15); no @ (Apr 16-Oct 31)`
 *
 * We split on top-level `;` (respecting parentheses) and return one
 * {@link Condition} per clause that carries a temporal scope. The `when`
 * field is filled lazily by the caller so tests do not require the
 * `opening_hours` dependency to load.
 */
export interface ConditionalClause {
  value: string;          // e.g. "yes" / "no" / numeric toll amount
  conditionText: string;  // everything after the '@'
}

export function splitConditional(raw: string): ConditionalClause[] {
  const clauses: ConditionalClause[] = [];
  let depth = 0;
  let current = "";
  const parts: string[] = [];

  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      if (current.trim()) parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  for (const part of parts) {
    const atIdx = indexOfTopLevelAt(part);
    if (atIdx === -1) continue;
    const value = part.slice(0, atIdx).trim();
    const cond = part.slice(atIdx + 1).trim();
    if (value && cond) clauses.push({ value, conditionText: stripOuterParens(cond) });
  }
  return clauses;
}

function indexOfTopLevelAt(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "@" && depth === 0) return i;
  }
  return -1;
}

function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t.startsWith("(") && t.endsWith(")")) return t.slice(1, -1).trim();
  return t;
}

/**
 * Parse an OSM conditional string into structured {@link Condition}s.
 * `parseWhen` is injected so this module stays decoupled from `opening_hours`
 * (which is heavy and only needed at tile-build time).
 *
 * If `parseWhen` throws for a clause, we still produce a Condition with
 * `when: null`, preserving the raw text for the popup. No data is lost.
 */
export function parseCondition(
  raw: string,
  parseWhen: (expr: string) => unknown,
): Condition[] {
  const clauses = splitConditional(raw);
  return clauses.map((c) => {
    let when: unknown = null;
    try {
      when = parseWhen(c.conditionText);
    } catch {
      when = null;
    }
    return {
      when,
      raw: `${c.value} @ ${c.conditionText}`,
    };
  });
}
