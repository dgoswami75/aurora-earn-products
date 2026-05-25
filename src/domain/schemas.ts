import { z } from "zod";

/**
 * Schemas mirror the shapes returned by Kraken's
 *  - POST /private/Earn/Strategies
 *  - GET  /public/Assets
 *
 * We validate at the boundary so any malformed input fails predictably
 * rather than leaking through to the customer-facing response.
 */

const LockTypeSchema = z
  .object({
    type: z.string(),
    unbonding_period: z.number().optional(),
  })
  .passthrough();

const AprEstimateSchema = z.object({
  low: z.string(),
  high: z.string(),
});

export const StrategyItemSchema = z
  .object({
    id: z.string(),
    asset: z.string(),
    asset_class: z.string().optional(),
    lock_type: LockTypeSchema,
    apr_estimate: AprEstimateSchema.optional(),
    user_min_allocation: z.string(),
    can_allocate: z.boolean(),
    yield_source: z
      .object({ type: z.string() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const StrategiesFileSchema = z.object({
  error: z.array(z.unknown()).optional(),
  result: z.object({
    next_cursor: z.string().nullable().optional(),
    items: z.array(StrategyItemSchema),
  }),
});

export const AssetEntrySchema = z
  .object({
    aclass: z.string().optional(),
    altname: z.string(),
    decimals: z.number().optional(),
    display_decimals: z.number().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const AssetsFileSchema = z.object({
  error: z.array(z.unknown()).optional(),
  result: z.record(z.string(), AssetEntrySchema),
});

export type StrategyItem = z.infer<typeof StrategyItemSchema>;
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type StrategiesFile = z.infer<typeof StrategiesFileSchema>;
export type AssetsFile = z.infer<typeof AssetsFileSchema>;
