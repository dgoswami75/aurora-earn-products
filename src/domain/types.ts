export type Tier = "Standard" | "Premium" | "Private";

export const TIERS: readonly Tier[] = ["Standard", "Premium", "Private"] as const;

export interface EarnProduct {
  strategyId: string;
  asset: string;
  displayName: string;
  lockType: string;
  apyDisplay: string;
  apyValue: number;
  eligibleTiers: Tier[];
  minimumAmount: string;
}

export interface StructuredError {
  error: {
    code: string;
    message: string;
  };
}
