import { describe, it, expect } from "vitest";
import { interpretSeasonal } from "../src/seasonal.js";
import { SeasonalReason } from "@mmt/model";

describe("interpretSeasonal", () => {
  it("seasonal=winter → winter_only_road", () => {
    const r = interpretSeasonal({ seasonal: "winter" });
    expect(r.status).toBe("winter_only_road");
    expect(r.reason_code).toBe(SeasonalReason.SEASONAL_WINTER);
  });

  it("motor_vehicle:conditional with no @ Nov-Apr → winter_closure", () => {
    const r = interpretSeasonal({
      "motor_vehicle:conditional": "no @ (Nov 1-Apr 30)",
    });
    expect(r.status).toBe("winter_closure");
    expect(r.reason_code).toBe(SeasonalReason.CONDITIONAL_WINTER_NO);
    expect(r.months).toEqual(["Jan", "Feb", "Mar", "Apr", "Nov", "Dec"]);
    expect(r.raw).toBe("no @ (Nov 1-Apr 30)");
  });

  it("vehicle:conditional with no @ Nov-Mar → winter_closure", () => {
    const r = interpretSeasonal({
      "vehicle:conditional": "no @ (Nov-Mar)",
    });
    expect(r.status).toBe("winter_closure");
    expect(r.months).toEqual(["Jan", "Feb", "Mar", "Nov", "Dec"]);
  });

  it("access:conditional with no @ Dec-Feb → winter_closure", () => {
    const r = interpretSeasonal({
      "access:conditional": "no @ (Dec-Feb)",
    });
    expect(r.status).toBe("winter_closure");
    expect(r.months).toEqual(["Jan", "Feb", "Dec"]);
  });

  it("ignores single-day November closure (event, not seasonal)", () => {
    const r = interpretSeasonal({
      "motor_vehicle:conditional": "no @ (Nov 5)",
    });
    expect(r.status).toBe("unknown");
  });

  it("ignores summer-month closures", () => {
    const r = interpretSeasonal({
      "motor_vehicle:conditional": "no @ (Jun-Aug)",
    });
    expect(r.status).toBe("unknown");
  });

  it("returns unknown when no relevant tags", () => {
    const r = interpretSeasonal({ highway: "primary" });
    expect(r.status).toBe("unknown");
    expect(r.reason_code).toBeNull();
  });

  it("handles motorcar:conditional", () => {
    const r = interpretSeasonal({
      "motorcar:conditional": "no @ (Oct 15-May 15)",
    });
    expect(r.status).toBe("winter_closure");
    // Oct is not in WINTER_MONTHS but Nov-Apr are; May is borderline.
    // We check the count, not exact membership, so this still triggers.
    expect(r.months).toContain("Nov");
    expect(r.months).toContain("Apr");
  });
});
