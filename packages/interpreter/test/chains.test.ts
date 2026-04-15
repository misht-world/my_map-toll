import { describe, it, expect } from "vitest";
import { interpretChains } from "../src/chains.js";
import { ChainsReason } from "@mmt/model";

describe("interpretChains", () => {
  it("treats snow_chains=required as explicit", () => {
    const r = interpretChains({ snow_chains: "required" });
    expect(r.status).toBe("explicit");
    expect(r.reason_code).toBe(ChainsReason.SNOW_CHAINS_REQUIRED);
  });

  it("treats snow_chains=yes as explicit", () => {
    const r = interpretChains({ snow_chains: "yes" });
    expect(r.status).toBe("explicit");
    expect(r.reason_code).toBe(ChainsReason.SNOW_CHAINS_YES);
  });

  it("parses snow_chains:conditional into conditional status", () => {
    const r = interpretChains(
      { "snow_chains:conditional": "required @ (Nov 01-Apr 15)" },
      () => ({ ast: true }),
    );
    expect(r.status).toBe("conditional");
    expect(r.reason_code).toBe(ChainsReason.CONDITIONAL);
    expect(r.conditions).toHaveLength(1);
  });

  it("returns ambiguous for winter_road=yes without explicit chain tag", () => {
    const r = interpretChains({ winter_road: "yes" });
    expect(r.status).toBe("ambiguous");
    expect(r.reason_code).toBe(ChainsReason.WINTER_ROAD_AMBIGUOUS);
  });

  it("returns unknown when no relevant tags are present", () => {
    const r = interpretChains({ highway: "primary" });
    expect(r.status).toBe("unknown");
  });
});
