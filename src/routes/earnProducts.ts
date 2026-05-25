import { Request, Response, Router } from "express";
import { LoadedData } from "../dataLoader";
import { buildEarnProducts } from "../domain/transform";
import { Tier } from "../domain/types";
import { ErrorCodes, sendError } from "../errors";

const TIER_LOOKUP: Record<string, Tier> = {
  standard: "Standard",
  premium: "Premium",
  private: "Private",
};

export function createEarnProductsRouter(getData: () => LoadedData): Router {
  const router = Router();

  router.get("/earn-products", (req: Request, res: Response) => {
    const rawTier = req.query.tier;
    if (typeof rawTier !== "string" || rawTier.trim() === "") {
      return sendError(
        res,
        400,
        ErrorCodes.INVALID_TIER,
        "Missing required query parameter `tier`. Expected one of: standard, premium, private.",
      );
    }

    const tier = TIER_LOOKUP[rawTier.trim().toLowerCase()];
    if (!tier) {
      return sendError(
        res,
        400,
        ErrorCodes.INVALID_TIER,
        `Unknown tier "${rawTier}". Expected one of: standard, premium, private.`,
      );
    }

    const { strategies, assets } = getData();
    const products = buildEarnProducts(strategies, assets, tier);
    return res.status(200).json(products);
  });

  return router;
}
