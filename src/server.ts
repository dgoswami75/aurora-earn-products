import express, { Express, NextFunction, Request, Response } from "express";
import path from "node:path";
import { LoadedData, loadData } from "./dataLoader";
import { createEarnProductsRouter } from "./routes/earnProducts";
import { ErrorCodes, sendError } from "./errors";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");

export function createApp(getData: () => LoadedData): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use(createEarnProductsRouter(getData));

  app.use((_req, res) => {
    sendError(res, 404, ErrorCodes.NOT_FOUND, "Not found");
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] Unhandled error:", err);
    if (res.headersSent) return;
    sendError(
      res,
      500,
      ErrorCodes.INTERNAL,
      "An unexpected error occurred while processing the request.",
    );
  });

  return app;
}

async function main(): Promise<void> {
  let data: LoadedData;
  try {
    data = await loadData(DATA_DIR);
  } catch (err) {
    console.error(`[server] Failed to load data from ${DATA_DIR}:`, (err as Error).message);
    process.exit(1);
  }
  console.log(
    `[server] Loaded ${data.strategies.length} strategies and ${Object.keys(data.assets).length} assets from ${DATA_DIR}`,
  );

  const app = createApp(() => data);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Aurora earn-products service listening on http://0.0.0.0:${PORT}`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[server] Fatal error during startup:", err);
    process.exit(1);
  });
}
