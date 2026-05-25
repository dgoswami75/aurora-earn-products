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
});
