// Extracts unique passive-tree icons from a local Path of Exile 2 install,
// converts them from DDS to WebP, and writes them under public/tree-icons/
// preserving the in-game path.
//
// Usage: node scripts/extract-tree-icons.mjs [--poe <install-dir>] [--tree <path>] [--out <dir>]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decompressedBundleSize, decompressSliceInBundle } from "pathofexile-dat/bundles.js";
import { readIndexBundle, getFileInfo } from "pathofexile-dat/bundles.js";
import { parseDDSHeader, decodeImage } from "dds-ktx-parser";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const POE_DIR = args.poe ?? "D:/SteamLibrary/steamapps/common/Path of Exile 2";
const TREE_JSON = args.tree ?? join(repoRoot, "src-frontend/data/tree.json");
const OUT_DIR = args.out ?? join(repoRoot, "public/tree-icons");
const BUNDLES_DIR = join(POE_DIR, "Bundles2");

async function collectIconPaths() {
  const raw = JSON.parse(await readFile(TREE_JSON, "utf8"));
  const nodes = Array.isArray(raw) ? raw : raw.nodes ?? raw;
  const arr = Array.isArray(nodes) ? nodes : Object.values(nodes);
  const icons = new Set();
  for (const n of arr) {
    if (n && typeof n.icon === "string" && n.icon.trim()) icons.add(n.icon);
  }
  return [...icons];
}

class SteamLoader {
  constructor(bundlesDir) {
    this.bundlesDir = bundlesDir;
    this.cache = new Map();
  }
  async fetch(name) {
    let buf = this.cache.get(name);
    if (!buf) {
      buf = new Uint8Array(await readFile(join(this.bundlesDir, name)));
      this.cache.set(name, buf);
    }
    return buf;
  }
}

async function loadIndex(loader) {
  const indexBin = await loader.fetch("_.index.bin");
  const indexBundle = new Uint8Array(decompressedBundleSize(indexBin));
  decompressSliceInBundle(indexBin, 0, indexBundle);
  return readIndexBundle(indexBundle);
}

async function readFileFromIndex(loader, index, path) {
  const info = getFileInfo(path, index.bundlesInfo, index.filesInfo);
  if (!info) return null;
  const bundleBin = await loader.fetch(info.bundle);
  const out = new Uint8Array(info.size);
  decompressSliceInBundle(bundleBin, info.offset, out);
  return out;
}

async function ddsToWebp(ddsBuf) {
  const header = parseDDSHeader(ddsBuf);
  if (!header) throw new Error("DDS header parse failed");
  const rgba = decodeImage(ddsBuf, header.format, header.layers[0]);
  return sharp(Buffer.from(rgba), {
    raw: { width: header.shape.width, height: header.shape.height, channels: 4 },
  })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}

async function main() {
  console.log(`Tree JSON : ${TREE_JSON}`);
  console.log(`PoE dir   : ${POE_DIR}`);
  console.log(`Output    : ${OUT_DIR}`);

  const iconPaths = await collectIconPaths();
  console.log(`\nUnique icon paths: ${iconPaths.length}`);

  const loader = new SteamLoader(BUNDLES_DIR);
  console.log("Loading bundle index...");
  const index = await loadIndex(loader);

  let ok = 0;
  let missing = 0;
  let failed = 0;
  const missingPaths = [];
  const failedPaths = [];
  const startedAt = Date.now();

  for (let i = 0; i < iconPaths.length; i++) {
    const path = iconPaths[i];
    const outPath = join(OUT_DIR, path.replace(/\.dds$/i, ".webp"));
    try {
      const dds = await readFileFromIndex(loader, index, path);
      if (!dds) {
        missing++;
        missingPaths.push(path);
        continue;
      }
      const webp = await ddsToWebp(dds);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, webp);
      ok++;
    } catch (err) {
      failed++;
      failedPaths.push(`${path} — ${err.message}`);
    }
    if ((i + 1) % 50 === 0 || i === iconPaths.length - 1) {
      process.stdout.write(`\r  processed ${i + 1}/${iconPaths.length}  ok=${ok} miss=${missing} fail=${failed}   `);
    }
  }
  process.stdout.write("\n");

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s  →  ok=${ok}, missing=${missing}, failed=${failed}`);
  if (missingPaths.length) {
    console.log("\nMissing from bundle index (first 10):");
    for (const p of missingPaths.slice(0, 10)) console.log(`  - ${p}`);
    if (missingPaths.length > 10) console.log(`  ... and ${missingPaths.length - 10} more`);
  }
  if (failedPaths.length) {
    console.log("\nDecode/encode failures (first 10):");
    for (const p of failedPaths.slice(0, 10)) console.log(`  - ${p}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
