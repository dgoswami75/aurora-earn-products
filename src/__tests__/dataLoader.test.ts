import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadData } from "../dataLoader";

const STRATEGIES_A = {
  error: [],
  result: {
    next_cursor: null,
    items: [
      {
        id: "S1",
        asset: "XETH",
        asset_class: "currency",
        lock_type: { type: "instant" },
        apr_estimate: { low: "5.0", high: "6.0" },
        user_min_allocation: "0.01",
        can_allocate: true,
      },
    ],
  },
};

const STRATEGIES_B = {
  error: [],
  result: {
    next_cursor: null,
    items: [
      {
        id: "S2",
        asset: "DOT",
        asset_class: "currency",
        lock_type: { type: "instant" },
        apr_estimate: { low: "8.0", high: "9.0" },
        user_min_allocation: "1",
        can_allocate: true,
      },
    ],
  },
};

const ASSETS_A = {
  error: [],
  result: {
    XETH: { aclass: "currency", altname: "ETH", status: "enabled" },
    DOT: { aclass: "currency", altname: "DOT", status: "enabled" },
  },
};

const ASSETS_B = {
  error: [],
  result: {
    XETH: { aclass: "currency", altname: "ETHEREUM", status: "enabled" },
    USDC: { aclass: "currency", altname: "USDC", status: "enabled" },
  },
};

async function writeJSON(dir: string, name: string, payload: unknown): Promise<void> {
  await fs.writeFile(path.join(dir, name), JSON.stringify(payload, null, 2), "utf8");
}

let tmpDir: string;
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-dataLoader-"));
  warn.mockClear();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("loadData", () => {
  it("loads a single strategies + single assets file (happy path)", async () => {
    await writeJSON(tmpDir, "strategies.json", STRATEGIES_A);
    await writeJSON(tmpDir, "assets.json", ASSETS_A);

    const { strategies, assets } = await loadData(tmpDir);
    expect(strategies).toHaveLength(1);
    expect(strategies[0].id).toBe("S1");
    expect(Object.keys(assets).sort()).toEqual(["DOT", "XETH"]);
  });

  it("concatenates strategies from multiple files", async () => {
    await writeJSON(tmpDir, "strategies-a.json", STRATEGIES_A);
    await writeJSON(tmpDir, "strategies-b.json", STRATEGIES_B);
    await writeJSON(tmpDir, "assets.json", ASSETS_A);

    const { strategies } = await loadData(tmpDir);
    expect(strategies.map((s) => s.id).sort()).toEqual(["S1", "S2"]);
  });

  it("merges assets across multiple files (later wins on key collision)", async () => {
    await writeJSON(tmpDir, "strategies.json", STRATEGIES_A);
    await writeJSON(tmpDir, "assets-a.json", ASSETS_A);
    await writeJSON(tmpDir, "assets-b.json", ASSETS_B);

    const { assets } = await loadData(tmpDir);
    expect(Object.keys(assets).sort()).toEqual(["DOT", "USDC", "XETH"]);
    // Files are sorted alphabetically, so assets-b loads after assets-a
    expect(assets.XETH.altname).toBe("ETHEREUM");
  });

  it("skips files that match neither schema, logs a warning, does not throw", async () => {
    await writeJSON(tmpDir, "strategies.json", STRATEGIES_A);
    await writeJSON(tmpDir, "assets.json", ASSETS_A);
    await writeJSON(tmpDir, "unrelated.json", { purpose: "noise" });

    const { strategies } = await loadData(tmpDir);
    expect(strategies).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping unrelated.json"),
    );
  });

  it("ignores non-JSON files", async () => {
    await writeJSON(tmpDir, "strategies.json", STRATEGIES_A);
    await writeJSON(tmpDir, "assets.json", ASSETS_A);
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Notes", "utf8");
    await fs.writeFile(path.join(tmpDir, "scratch.txt"), "ignore me", "utf8");

    await expect(loadData(tmpDir)).resolves.toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores subdirectories", async () => {
    await writeJSON(tmpDir, "strategies.json", STRATEGIES_A);
    await writeJSON(tmpDir, "assets.json", ASSETS_A);
    await fs.mkdir(path.join(tmpDir, "subdir"));
    await writeJSON(path.join(tmpDir, "subdir"), "ignored.json", { junk: true });

    const { strategies } = await loadData(tmpDir);
    expect(strategies).toHaveLength(1);
  });

  it("picks up files with uppercase .JSON extension", async () => {
    await fs.writeFile(
      path.join(tmpDir, "STRATEGIES.JSON"),
      JSON.stringify(STRATEGIES_A),
      "utf8",
    );
    await writeJSON(tmpDir, "assets.json", ASSETS_A);

    const { strategies } = await loadData(tmpDir);
    expect(strategies).toHaveLength(1);
  });

  it("throws a clear error when the directory has no JSON files", async () => {
    await expect(loadData(tmpDir)).rejects.toThrow(/No JSON files found/);
  });

  it("throws when no strategies file is present", async () => {
    await writeJSON(tmpDir, "assets.json", ASSETS_A);
    await expect(loadData(tmpDir)).rejects.toThrow(
      /No strategies loaded/,
    );
  });

  it("throws when no assets file is present", async () => {
    await writeJSON(tmpDir, "strategies.json", STRATEGIES_A);
    await expect(loadData(tmpDir)).rejects.toThrow(/No assets loaded/);
  });

  it("throws on syntactically invalid JSON, naming the bad file", async () => {
    await fs.writeFile(path.join(tmpDir, "broken.json"), "{ this is not json", "utf8");
    await expect(loadData(tmpDir)).rejects.toThrow(/Failed to parse broken\.json/);
  });
});
