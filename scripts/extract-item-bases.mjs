// Walks vendor/PathOfBuilding-PoE2/src/Data/Bases/*.lua, runs each through our
// bundled LuaJIT to accumulate every base-type definition (slot, implicit,
// tags, requirements), and writes a single JSON blob to public/item-bases.json
// so the frontend can look up slot + default implicit for any imported item.
//
// Usage: pnpm extract-item-bases

import { readdirSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const LUAJIT = join(repoRoot, "src-tauri/binaries/luajit-x86_64-pc-windows-msvc.exe");
const SHIM = join(repoRoot, "tools/extract/lua/extract_item_bases.lua");
const BASES_DIR = join(repoRoot, "vendor/PathOfBuilding-PoE2/src/Data/Bases");
const OUT = join(repoRoot, "public/item-bases.json");

mkdirSync(dirname(OUT), { recursive: true });

const files = readdirSync(BASES_DIR)
  .filter((f) => f.endsWith(".lua"))
  .map((f) => join(BASES_DIR, f));

if (files.length === 0) {
  console.error(`no .lua files found under ${BASES_DIR}`);
  process.exit(1);
}

const result = spawnSync(LUAJIT, [SHIM, OUT, ...files], { stdio: "inherit" });
if (result.status !== 0) {
  console.error("luajit failed");
  process.exit(result.status ?? 1);
}
console.log(`extracted ${files.length} base files → ${OUT}`);
