import { describe, expect, it } from "vitest";
import { eligibleTiersFor } from "../domain/tiers";
import { StrategyItem } from "../domain/schemas";

function strat(lockType: string, extras: Partial<StrategyItem> = {}): StrategyItem {
  return {
    id: "TEST",
    asset: "XETH",
    asset_class: "currency",
    lock_type: { type: lockType },
    user_min_allocation: "0",
    can_allocate: true,
    apr_estimate: { low: "5.0", high: "5.0" },
    ...extras,
  } as StrategyItem;
}

describe("eligibleTiersFor", () => {
  it("treats instant as all tiers", () => {
    expect(eligibleTiersFor(strat("instant"))).toEqual(["Standard", "Premium", "Private"]);
  });

  it("treats flex as all tiers (flex == flexible/instant-access)", () => {
    expect(eligibleTiersFor(strat("flex"))).toEqual(["Standard", "Premium", "Private"]);
  });

  it("restricts bonded to Premium and Private only", () => {
    expect(eligibleTiersFor(strat("bonded"))).toEqual(["Premium", "Private"]);
  });

  it("restricts timed lockup to Premium and Private", () => {
    expect(eligibleTiersFor(strat("timed"))).toEqual(["Premium", "Private"]);
  });

  it("restricts hybrid (delayed-withdrawal) to Premium and Private", () => {
    expect(eligibleTiersFor(strat("hybrid"))).toEqual(["Premium", "Private"]);
  });

  it("defaults unknown lock types to Premium and Private (safe default)", () => {
    expect(eligibleTiersFor(strat("something_new"))).toEqual(["Premium", "Private"]);
  });
});
