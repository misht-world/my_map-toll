import { describe, it, expect } from "vitest";
import { splitConditional, parseCondition } from "../src/conditions.js";

describe("splitConditional", () => {
  it("splits a single clause", () => {
    const out = splitConditional("yes @ (Nov 01-Apr 15)");
    expect(out).toEqual([
      { value: "yes", conditionText: "Nov 01-Apr 15" },
    ]);
  });

  it("splits multiple semicolon-separated clauses respecting parentheses", () => {
    const out = splitConditional(
      "yes @ (Nov 01-Apr 15); no @ (Apr 16-Oct 31)",
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.value).toBe("yes");
    expect(out[1]?.value).toBe("no");
  });

  it("ignores semicolons inside parentheses", () => {
    const out = splitConditional("yes @ (Mo-Fr 07:00-19:00; Sa 08:00-14:00)");
    expect(out).toHaveLength(1);
    expect(out[0]?.conditionText).toBe("Mo-Fr 07:00-19:00; Sa 08:00-14:00");
  });

  it("returns empty for malformed input with no '@'", () => {
    expect(splitConditional("just a string")).toEqual([]);
  });
});

describe("parseCondition", () => {
  it("preserves raw text and calls parseWhen for each clause", () => {
    const seen: string[] = [];
    const res = parseCondition(
      "yes @ (Nov 01-Apr 15); no @ (May)",
      (e) => {
        seen.push(e);
        return { marker: e };
      },
    );
    expect(seen).toEqual(["Nov 01-Apr 15", "May"]);
    expect(res).toHaveLength(2);
    expect(res[0]?.raw).toBe("yes @ Nov 01-Apr 15");
    expect(res[0]?.when).toEqual({ marker: "Nov 01-Apr 15" });
  });

  it("falls back to when=null if parseWhen throws", () => {
    const res = parseCondition("yes @ (garbage)", () => {
      throw new Error("bad");
    });
    expect(res).toHaveLength(1);
    expect(res[0]?.when).toBeNull();
    expect(res[0]?.raw).toContain("garbage");
  });
});
