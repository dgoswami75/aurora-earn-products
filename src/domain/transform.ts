import { AssetEntry, StrategyItem } from "./schemas";
import { eligibleTiersFor } from "./tiers";
import { EarnProduct, Tier } from "./types";

const APY_THRESHOLD = 3;

const LOCK_TYPE_LABEL: Record<string, string> = {
  instant: "Instant",
  flex: "Flexible",
  bonded: "Bonded",
  timed: "Timed",
  hybrid: "Hybrid",
};

const YIELD_SOURCE_LABEL: Record<string, string> = {
  staking: "Staking",
  defi: "DeFi",
  opt_in_rewards: "Rewards",
};

/**
 * Produces the customer-facing earn-product list for the requested tier.
 *
 * Pipeline:
 *   1. resolve asset code -> altname via the assets map
 *   2. compute apyValue from apr_estimate (conservative: use `low`)
 *   3. drop unallocatable, disabled, malformed, or sub-threshold rows
 *   4. apply tier filter
 *   5. sort by apyValue descending
 *
 * Note on APR vs APY: Kraken returns `apr_estimate`. We surface the lower
 * bound as `apyValue` to match Aurora's required output shape; converting
 * APR -> APY would require assumptions about compounding we can't validate.
 * Documented in solution-design-note.md.
 */
export function buildEarnProducts(
  strategies: StrategyItem[],
  assets: Record<string, AssetEntry>,
  requestedTier: Tier,
): EarnProduct[] {
  const products: EarnProduct[] = [];

  for (const strategy of strategies) {
    const product = toEarnProduct(strategy, assets);
    if (!product) continue;
    if (!product.eligibleTiers.includes(requestedTier)) continue;
    products.push(product);
  }

  products.sort((a, b) => b.apyValue - a.apyValue);
  return products;
}

function toEarnProduct(
  strategy: StrategyItem,
  assets: Record<string, AssetEntry>,
): EarnProduct | null {
  if (!strategy.can_allocate) return null;

  const asset = assets[strategy.asset];
  if (!asset) return null;
  if (asset.status !== undefined && asset.status !== "enabled") return null;

  const apyValue = parseApy(strategy);
  if (apyValue === null) return null;
  if (apyValue < APY_THRESHOLD) return null;

  const lockTypeRaw = strategy.lock_type.type;
  const displayName = buildDisplayName(
    asset.altname,
    lockTypeRaw,
    strategy.yield_source?.type,
  );

  return {
    strategyId: strategy.id,
    asset: asset.altname,
    displayName,
    lockType: lockTypeRaw,
    apyValue: round2(apyValue),
    apyDisplay: `${round2(apyValue).toFixed(2)}%`,
    eligibleTiers: eligibleTiersFor(strategy),
    minimumAmount: strategy.user_min_allocation,
  };
}

function parseApy(strategy: StrategyItem): number | null {
  const estimate = strategy.apr_estimate;
  if (!estimate) return null;
  const low = Number(estimate.low);
  if (!Number.isFinite(low)) return null;
  return low;
}

function buildDisplayName(
  altname: string,
  lockType: string,
  yieldSource: string | undefined,
): string {
  const lockLabel = LOCK_TYPE_LABEL[lockType] ?? capitalize(lockType);
  const yieldLabel = yieldSource
    ? (YIELD_SOURCE_LABEL[yieldSource] ?? capitalize(yieldSource))
    : "Earn";
  return `${altname} ${lockLabel} ${yieldLabel}`;
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
