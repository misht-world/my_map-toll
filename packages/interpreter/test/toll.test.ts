import { describe, it, expect } from "vitest";
import { interpretToll } from "../src/toll.js";
import { TollReason } from "@mmt/model";

describe("interpretToll", () => {
  it("treats toll:motorcar=yes as explicit_yes", () => {
    const r = interpretToll({ "toll:motorcar": "yes", highway: "motorway" });
    expect(r.status).toBe("explicit_yes");
    expect(r.reason_code).toBe(TollReason.MOTORCAR_YES);
  });

  it("treats toll:motorcar=no as explicit_no", () => {
    const r = interpretToll({ "toll:motorcar": "no" });
    expect(r.status).toBe("explicit_no");
    expect(r.reason_code).toBe(TollReason.MOTORCAR_NO);
  });

  it("treats bare toll=yes as applicable to cars (explicit_yes)", () => {
    const r = interpretToll({ toll: "yes" });
    expect(r.status).toBe("explicit_yes");
    expect(r.reason_code).toBe(TollReason.GENERIC_YES);
  });

  it("treats toll:motor_vehicle=yes as explicit_yes when no motorcar override", () => {
    const r = interpretToll({ "toll:motor_vehicle": "yes" });
    expect(r.status).toBe("explicit_yes");
    expect(r.reason_code).toBe(TollReason.MOTOR_VEHICLE_YES);
  });

  it("returns unknown when only HGV toll is tagged (not relevant for car map)", () => {
    const r = interpretToll({ "toll:hgv": "yes" });
    expect(r.status).toBe("unknown");
    expect(r.reason_code).toBeNull();
  });

  it("returns unknown when no toll tags are present", () => {
    const r = interpretToll({ highway: "residential" });
    expect(r.status).toBe("unknown");
    expect(r.reason_code).toBeNull();
  });

  it("parses toll:conditional into a conditional status with structured conditions", () => {
    const r = interpretToll(
      { "toll:conditional": "yes @ (Nov 01-Apr 15)" },
      () => ({ ast: "parsed" }),
    );
    expect(r.status).toBe("conditional");
    expect(r.reason_code).toBe(TollReason.CONDITIONAL);
    expect(r.conditions).toHaveLength(1);
    expect(r.conditions?.[0]?.raw).toContain("Nov 01-Apr 15");
  });

  it("prefers explicit motorcar signal over conditional generic toll", () => {
    const r = interpretToll({
      "toll:motorcar": "yes",
      "toll:conditional": "no @ (Su)",
    });
    expect(r.status).toBe("explicit_yes");
  });
});
