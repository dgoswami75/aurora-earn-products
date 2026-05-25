import fs from "node:fs/promises";
import path from "node:path";
import {
  AssetEntry,
  AssetsFileSchema,
  StrategiesFileSchema,
  StrategyItem,
} from "./domain/schemas";

export interface LoadedData {
  strategies: StrategyItem[];
  assets: Record<string, AssetEntry>;
}

/**
 * Reads every *.json file in the data directory and classifies each by
 * its top-level shape, since the grading pipeline may drop in additional
 * fixtures. Multiple strategy files are concatenated; multiple asset files
 * are merged (later wins on key collision).
 *
 * Files that match neither schema are skipped with a warning rather than
 * crashing the boot, so a stray README.json (or similar) doesn't break us.
 */
export async function loadData(dataDir: string): Promise<LoadedData> {
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => path.join(dataDir, e.name))
    .sort();

  if (jsonFiles.length === 0) {
    throw new Error(`No JSON files found in data directory: ${dataDir}`);
  }

  const strategies: StrategyItem[] = [];
  const assets: Record<string, AssetEntry> = {};

  for (const filePath of jsonFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to parse ${path.basename(filePath)}: ${(err as Error).message}`,
      );
    }

    const asStrategies = StrategiesFileSchema.safeParse(parsed);
    if (asStrategies.success) {
      strategies.push(...asStrategies.data.result.items);
      continue;
    }

    const asAssets = AssetsFileSchema.safeParse(parsed);
    if (asAssets.success) {
      Object.assign(assets, asAssets.data.result);
      continue;
    }

    console.warn(
      `[dataLoader] Skipping ${path.basename(filePath)} — does not match strategies or assets schema`,
    );
  }

  if (strategies.length === 0) {
    throw new Error("No strategies loaded — at least one strategies file is required");
  }
  if (Object.keys(assets).length === 0) {
    throw new Error("No assets loaded — at least one assets file is required");
  }

  return { strategies, assets };
}
