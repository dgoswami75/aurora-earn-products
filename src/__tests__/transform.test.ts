import { describe, expect, it } from "vitest";
import { buildEarnProducts } from "../domain/transform";
import { AssetEntry, StrategyItem } from "../domain/schemas";

const ASSETS: Record<string, AssetEntry> = {
  XETH: { aclass: "currency", altname: "ETH", status: "enabled" },
  XADA: { aclass: "currency", altname: "ADA", status: "enabled" },
  XXTZ: { aclass: "currency", altname: "XTZ", status: "enabled" },
  DOT: { aclass: "currency", altname: "DOT", status: "enabled" },
  AVAX: { aclass: "currency", altname: "AVAX", status: "enabled" },
  ATOM: { aclass: "currency", altname: "ATOM", status: "enabled" },
  MINA: { aclass: "currency", altname: "MINA", status: "enabled" },
  DEAD: { aclass: "currency", altname: "DEAD", status: "disabled" },
};

function strat(overrides: Partial<StrategyItem> & { id: string }): StrategyItem {
  return {
    asset: "XETH",
    asset_class: "currency",
    lock_type: { type: "instant" },
    user_min_allocation: "0.01",
    can_allocate: true,
    apr_estimate: { low: "5.0", high: "6.0" },
    yield_source: { type: "staking" },
    ...overrides,
  } as StrategyItem;
}

describe("buildEarnProducts", () => {
  it("filters out strategies below the 3% APY threshold", () => {
    const strategies = [
      strat({ id: "S1", asset: "AVAX", apr_estimate: { low: "0.5", high: "1.5" } }),
      strat({ id: "S2", asset: "XETH", apr_estimate: { low: "4.0", high: "5.0" } }),
    ];
    const result = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(result.map((r) => r.strategyId)).toEqual(["S2"]);
  });

  it("treats XTZ (low=2.5, high=3.5) as below threshold using conservative low", () => {
    const strategies = [
      strat({
        id: "XTZ-FLEX",
        asset: "XXTZ",
        lock_type: { type: "flex" },
        apr_estimate: { low: "2.5", high: "3.5" },
      }),
    ];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(0);
  });

  it("normalises asset codes using altname (XETH -> ETH)", () => {
    const strategies = [strat({ id: "S1", asset: "XETH" })];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.asset).toBe("ETH");
    expect(out.displayName).toBe("ETH Instant Staking");
  });

  it("excludes strategies the user cannot allocate to", () => {
    const strategies = [strat({ id: "S1", can_allocate: false })];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(0);
  });

  it("excludes strategies with no apr_estimate (e.g. the MINA edge case)", () => {
    const strategies = [strat({ id: "S1", asset: "MINA", apr_estimate: undefined })];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(0);
  });

  it("excludes strategies whose asset is not enabled", () => {
    const strategies = [strat({ id: "S1", asset: "DEAD" })];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(0);
  });

  it("excludes strategies whose asset is missing from the assets map", () => {
    const strategies = [strat({ id: "S1", asset: "UNKNOWN_CODE" })];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(0);
  });

  it("hides bonded strategies from Standard customers", () => {
    const strategies = [
      strat({
        id: "BONDED",
        asset: "XETH",
        lock_type: { type: "bonded", unbonding_period: 333615 },
      }),
      strat({ id: "INSTANT", asset: "DOT", lock_type: { type: "instant" } }),
    ];
    const standard = buildEarnProducts(strategies, ASSETS, "Standard");
    expect(standard.map((r) => r.strategyId)).toEqual(["INSTANT"]);

    const premium = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(premium.map((r) => r.strategyId).sort()).toEqual(["BONDED", "INSTANT"]);
  });

  it("sorts results by APY descending", () => {
    const strategies = [
      strat({ id: "LOW", asset: "XETH", apr_estimate: { low: "4.0", high: "5.0" } }),
      strat({ id: "HIGH", asset: "DOT", apr_estimate: { low: "8.0", high: "12.0" } }),
      strat({ id: "MID", asset: "XADA", apr_estimate: { low: "6.0", high: "7.0" } }),
    ];
    const result = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(result.map((r) => r.strategyId)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("formats apyDisplay with two decimal places", () => {
    const strategies = [
      strat({ id: "S1", asset: "XETH", apr_estimate: { low: "4.2500", high: "4.7500" } }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.apyValue).toBe(4.25);
    expect(out.apyDisplay).toBe("4.25%");
  });

  it("returns an empty array when input is empty", () => {
    expect(buildEarnProducts([], ASSETS, "Premium")).toEqual([]);
  });

  it("passes a strategy at exactly the 3.00% boundary (>= 3, not > 3)", () => {
    const strategies = [
      strat({ id: "S1", asset: "XETH", apr_estimate: { low: "3.0", high: "3.0" } }),
    ];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(1);
  });

  it("treats Number('2.9999999999999999') as 3 (the POL/MATIC IEEE-754 case)", () => {
    // 2.999...9 with enough nines to overflow Float64 precision parses as 3.0
    // exactly. We documented this as a soft cliff in solution-design-note.md;
    // this test locks the behaviour in.
    const strategies = [
      strat({
        id: "POL",
        asset: "XETH",
        apr_estimate: { low: "2.9999999999999999", high: "3.0000000000000001" },
      }),
    ];
    const result = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(result).toHaveLength(1);
    expect(result[0].apyValue).toBe(3);
  });

  it("drops a strategy whose apr_estimate.low is not a finite number", () => {
    const strategies = [
      strat({
        id: "S1",
        asset: "XETH",
        apr_estimate: { low: "not-a-number", high: "5.0" },
      }),
    ];
    expect(buildEarnProducts(strategies, ASSETS, "Premium")).toHaveLength(0);
  });

  it("falls back to 'Earn' in displayName when yield_source is missing", () => {
    const strategies = [
      strat({ id: "S1", asset: "XETH", yield_source: undefined }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.displayName).toBe("ETH Instant Earn");
  });

  it("capitalises an unknown yield_source for displayName", () => {
    const strategies = [
      strat({
        id: "S1",
        asset: "XETH",
        yield_source: { type: "novel_source" },
      }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.displayName).toBe("ETH Instant Novel_source");
  });

  it("capitalises an unknown lock_type for displayName", () => {
    const strategies = [
      strat({
        id: "S1",
        asset: "XETH",
        lock_type: { type: "exotic" },
      }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.displayName).toBe("ETH Exotic Staking");
    // Unknown lock_type defaults to Premium+Private — still visible here
    expect(out.eligibleTiers).toEqual(["Premium", "Private"]);
  });

  it("formats whole-number APY with two decimals (4 -> '4.00%')", () => {
    const strategies = [
      strat({ id: "S1", asset: "XETH", apr_estimate: { low: "4", high: "4" } }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.apyValue).toBe(4);
    expect(out.apyDisplay).toBe("4.00%");
  });

  it("preserves minimumAmount as a string (avoiding precision loss)", () => {
    const strategies = [
      strat({ id: "S1", asset: "XETH", user_min_allocation: "0.0000000001" }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.minimumAmount).toBe("0.0000000001");
    expect(typeof out.minimumAmount).toBe("string");
  });

  it("performs a stable sort when two strategies share an APY", () => {
    // ES2019+ Array#sort is required to be stable. Lock the contract in:
    // for equal apyValue, input order must be preserved.
    const strategies = [
      strat({ id: "FIRST", asset: "XETH", apr_estimate: { low: "5.0", high: "5.0" } }),
      strat({ id: "SECOND", asset: "DOT", apr_estimate: { low: "5.0", high: "5.0" } }),
      strat({ id: "THIRD", asset: "XADA", apr_estimate: { low: "5.0", high: "5.0" } }),
    ];
    const result = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(result.map((r) => r.strategyId)).toEqual(["FIRST", "SECOND", "THIRD"]);
  });

  it("rounds 4.255 up to 4.26% (IEEE-754 representation rounds positive)", () => {
    // The float64 closest to 4.255 is 4.25500000000000043..., so 4.255 * 100
    // is 425.50000000000006, which Math.round() takes to 426. This is a
    // deterministic quirk of IEEE-754 — the test exists so a future refactor
    // (e.g. swapping Math.round for a banker's-rounding helper) makes the
    // change of behaviour visible.
    const strategies = [
      strat({ id: "S1", asset: "XETH", apr_estimate: { low: "4.255", high: "4.255" } }),
    ];
    const [out] = buildEarnProducts(strategies, ASSETS, "Premium");
    expect(out.apyDisplay).toBe("4.26%");
  });

  it("rounds clear-of-boundary values unambiguously", () => {
    const strategies = [
      strat({ id: "A", asset: "XETH", apr_estimate: { low: "4.241", high: "4.241" } }),
      strat({ id: "B", asset: "DOT", apr_estimate: { low: "4.259", high: "4.259" } }),
    ];
    const out = buildEarnProducts(strategies, ASSETS, "Premium");
    const byId = Object.fromEntries(out.map((o) => [o.strategyId, o.apyDisplay]));
    expect(byId.A).toBe("4.24%");
    expect(byId.B).toBe("4.26%");
  });
});
