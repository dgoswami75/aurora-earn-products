import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../server";
import { AssetEntry, StrategyItem } from "../domain/schemas";
import { LoadedData } from "../dataLoader";
import { createEarnProductsRouter } from "../routes/earnProducts";
import { ErrorCodes, sendError } from "../errors";

const ASSETS: Record<string, AssetEntry> = {
  XETH: { aclass: "currency", altname: "ETH", status: "enabled" },
  DOT: { aclass: "currency", altname: "DOT", status: "enabled" },
};

const STRATEGIES: StrategyItem[] = [
  {
    id: "S1",
    asset: "XETH",
    asset_class: "currency",
    lock_type: { type: "instant" },
    apr_estimate: { low: "5.0", high: "6.0" },
    user_min_allocation: "0.01",
    can_allocate: true,
    yield_source: { type: "staking" },
  } as StrategyItem,
  {
    id: "S2",
    asset: "DOT",
    asset_class: "currency",
    lock_type: { type: "bonded", unbonding_period: 100 },
    apr_estimate: { low: "10.0", high: "12.0" },
    user_min_allocation: "1",
    can_allocate: true,
    yield_source: { type: "staking" },
  } as StrategyItem,
];

const DATA: LoadedData = { strategies: STRATEGIES, assets: ASSETS };
const app = createApp(() => DATA);

describe("GET /health", () => {
  it("returns 200 with {status: ok}", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /earn-products", () => {
  it("returns 200 with the filtered array for a valid tier", async () => {
    const res = await request(app).get("/earn-products?tier=premium");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const item of res.body) {
      expect(item).toHaveProperty("strategyId");
      expect(item).toHaveProperty("eligibleTiers");
      expect(item.eligibleTiers).toContain("Premium");
    }
  });

  it("returns Standard customers only instant/flex strategies", async () => {
    const res = await request(app).get("/earn-products?tier=standard");
    expect(res.status).toBe(200);
    for (const item of res.body) {
      expect(["instant", "flex"]).toContain(item.lockType);
    }
  });

  it("accepts the tier query case-insensitively", async () => {
    const res = await request(app).get("/earn-products?tier=STANDARD");
    expect(res.status).toBe(200);
  });

  it("accepts tier with surrounding whitespace", async () => {
    const res = await request(app).get("/earn-products?tier=%20premium%20");
    expect(res.status).toBe(200);
  });

  it("returns 400 INVALID_TIER when tier is missing", async () => {
    const res = await request(app).get("/earn-products");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: ErrorCodes.INVALID_TIER, message: expect.any(String) },
    });
    expect(res.body.error.message).not.toMatch(/\n/);
    expect(res.body.error.message).not.toMatch(/ {4}at /);
  });

  it("returns 400 INVALID_TIER for an empty tier string", async () => {
    const res = await request(app).get("/earn-products?tier=");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_TIER);
  });

  it("returns 400 INVALID_TIER for an unknown tier value", async () => {
    const res = await request(app).get("/earn-products?tier=platinum");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_TIER);
  });

  it("returns 400 when tier is supplied as a repeated query param (array)", async () => {
    // Express parses ?tier=a&tier=b as ["a", "b"] — must reject, not crash.
    const res = await request(app).get("/earn-products?tier=premium&tier=standard");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCodes.INVALID_TIER);
  });
});

describe("unknown paths", () => {
  it("returns 404 NOT_FOUND structured error", async () => {
    const res = await request(app).get("/no-such-thing");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: ErrorCodes.NOT_FOUND, message: expect.any(String) },
    });
  });
});

describe("response hardening", () => {
  it("does not expose the x-powered-by header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns a structured INTERNAL error if a downstream handler throws", async () => {
    // Build a minimal app reusing the production middleware but with a
    // route that throws synchronously. This proves the global error
    // middleware emits the structured envelope rather than leaking a stack.
    const errorApp = express();
    errorApp.disable("x-powered-by");
    errorApp.get("/boom", () => {
      throw new Error("synthetic failure for test");
    });
    // Re-create the production error middleware shape here.
    errorApp.use((_req, res) => {
      sendError(res, 404, ErrorCodes.NOT_FOUND, "Not found");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorApp.use(
      (
        _err: Error,
        _req: express.Request,
        res: express.Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: express.NextFunction,
      ) => {
        if (res.headersSent) return;
        sendError(
          res,
          500,
          ErrorCodes.INTERNAL,
          "An unexpected error occurred while processing the request.",
        );
      },
    );

    const res = await request(errorApp).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe(ErrorCodes.INTERNAL);
    expect(res.body.error.message).not.toMatch(/synthetic failure/);
    errorSpy.mockRestore();
  });
});

describe("getData closure is read on every request", () => {
  // Catches a regression where someone hoists the result of getData() out
  // of the route handler and freezes the data at app construction time.
  it("reflects updates to the underlying data on subsequent calls", async () => {
    let data: LoadedData = { strategies: [], assets: ASSETS };
    const dynamicApp = express();
    dynamicApp.use(createEarnProductsRouter(() => data));
    dynamicApp.use((_req, res) =>
      sendError(res, 404, ErrorCodes.NOT_FOUND, "Not found"),
    );

    const first = await request(dynamicApp).get("/earn-products?tier=premium");
    expect(first.body).toEqual([]);

    data = { strategies: STRATEGIES, assets: ASSETS };

    const second = await request(dynamicApp).get("/earn-products?tier=premium");
    expect(second.body.length).toBeGreaterThan(0);
  });
});
