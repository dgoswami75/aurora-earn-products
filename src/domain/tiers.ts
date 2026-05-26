import { StrategyItem } from "./schemas";
import { Tier } from "./types";

const ALL_TIERS: Tier[] = ["Standard", "Premium", "Private"];
const PREMIUM_AND_PRIVATE: Tier[] = ["Premium", "Private"];

/**
 * Aurora's tier eligibility rules, derived from the assessment brief.
 *
 *   - Standard customers see only flexible / instant-access strategies.
 *     We treat `lock_type.type === "instant"` and `"flex"` as flexible.
 *   - All bonded strategies are Premium+Private only. The brief restricts
 *     bonded-with-unbonding-period to Premium+Private; we extend that to
 *     all bonded variants (none of the sample fixtures have zero unbonding)
 *     because the conservative choice is to hide any lockup from Standard.
 *   - `timed` and `hybrid` lock types are not covered by the brief.
 *     Both impose a lockup or delayed-withdrawal — we default to
 *     Premium+Private and document the choice in solution-design-note.md.
 *   - Any unknown lock_type defaults to Premium+Private (safe default —
 *     Standard customers never see something we don't understand).
 */
export function eligibleTiersFor(strategy: StrategyItem): Tier[] {
  const lockType = strategy.lock_type.type;

  switch (lockType) {
    case "instant":
    case "flex":
      return ALL_TIERS;
    case "bonded":
    case "timed":
    case "hybrid":
      return PREMIUM_AND_PRIVATE;
    default:
      return PREMIUM_AND_PRIVATE;
  }
}
