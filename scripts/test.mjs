import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const testDir = resolve(root, ".test-build");
await mkdir(testDir, { recursive: true });
const outfile = resolve(testDir, "engine.test.cjs");

await build({
  entryPoints: [resolve(root, "tests", "engine.test.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node20"],
  outfile,
});

const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
process.exit(result.status ?? 1);
