// Extracts class / ascendancy / group background images from PoB's packed
// `.dds.zst` tile-sheets (vendor/PathOfBuilding-PoE2/src/TreeData/{version}/)
// and writes each named tile as an individual WebP under
// public/tree-backgrounds/, plus a manifest.json mapping each logical name to
// its file + dimensions.
//
// How the sheets work: each `.dds.zst` is a zstd-compressed DDS (BC7-encoded)
// containing a row-major grid of fixed-size tiles. The filename carries the
// per-tile dimensions (e.g. `_1500_1500_` = 1500x1500). The DDS header tells
// us the full sheet width/height, from which we derive the tile grid. Each
// `ddsCoords[file][name]` entry is a 1-based tile index into that grid.
//
// Usage: node scripts/extract-tree-backgrounds.mjs [--tree <path>] [--out <dir>]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { decompress } from "fzstd";
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

const TREE_JSON = args.tree ?? join(repoRoot, "src-frontend/data/tree.json");
const OUT_DIR = args.out ?? join(repoRoot, "public/tree-backgrounds");
// Pick the vendor tree-data directory matching the tree.json we use. tree.lua
// lives alongside the .dds.zst files we need — discoverable via treeVersion
// in the manifest (or falling back to the most recent numeric dir).
const VENDOR_TREE_DATA_ROOT = join(
  repoRoot,
  "vendor/PathOfBuilding-PoE2/src/TreeData",
);

// Slugify a logical name ("Classes Blood Mage" / "PSGroupBackground1") into a
// filename-safe token. Preserves case so the output stays readable.
function slug(name) {
  return name.replace(/[^A-Za-z0-9_]+/g, "");
}

async function detectTreeVersion() {
  const raw = JSON.parse(await readFile(TREE_JSON, "utf8"));
  // Our tree.json is the dumped tree table from tree.lua — no version stamp on
  // the object itself. The manifest.json alongside the frontend data has it.
  try {
    const manifest = JSON.parse(
      await readFile(join(repoRoot, "src-frontend/data/manifest.json"), "utf8"),
    );
    if (manifest.treeVersion) return manifest.treeVersion.replace(/\./g, "_");
  } catch {}
  // Fallback: probe the vendor dir for the highest numeric folder.
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(VENDOR_TREE_DATA_ROOT, { withFileTypes: true });
  const versions = entries
    .filter((e) => e.isDirectory() && /^\d+_\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (versions.length === 0) throw new Error("no tree-data version dirs found");
  return versions[versions.length - 1];
}

// Parse the DDS once to get its header + mip layout + array slice count. We
// reuse the parsed metadata to decode individual slices on demand.
function loadSheet(filePath) {
  return (async () => {
    const zst = new Uint8Array(await readFile(filePath));
    const dds = decompress(zst);
    const header = parseDDSHeader(dds);
    if (!header) throw new Error(`DDS header parse failed: ${filePath}`);
    // `parseDDSHeader.layers` only describes the first array slice's mipmap
    // chain. For DX10 array textures the slices are concatenated after that
    // first chain. Pull arraySize from the DX10 extension header manually so
    // we know how many slices to expect.
    const view = new DataView(dds.buffer, dds.byteOffset + 128, 20);
    const arraySize = view.getUint32(12, true) || 1;
    const sliceBytes = header.layers.reduce((acc, l) => acc + l.length, 0);
    const baseLayer = header.layers[0];
    return {
      dds,
      format: header.format,
      tileW: header.shape.width,
      tileH: header.shape.height,
      arraySize,
      sliceBytes,
      baseOffset: baseLayer.offset,
      baseLength: baseLayer.length,
      baseShape: baseLayer.shape,
    };
  })();
}

// Decode a single array slice's largest mip into a full RGBA buffer. Slice
// offset = baseOffset + (index-1) * sliceBytes for 1-based indices (which is
// how ddsCoords stores them).
function decodeSlice(sheet, index) {
  const sliceOffset = sheet.baseOffset + (index - 1) * sheet.sliceBytes;
  const layer = {
    offset: sliceOffset,
    length: sheet.baseLength,
    shape: sheet.baseShape,
  };
  return decodeImage(sheet.dds, sheet.format, layer);
}

async function main() {
  const tree = JSON.parse(await readFile(TREE_JSON, "utf8"));
  const ddsCoords = tree.ddsCoords || {};
  if (Object.keys(ddsCoords).length === 0) {
    throw new Error("tree.json has no ddsCoords");
  }
  const version = await detectTreeVersion();
  const vendorDir = join(VENDOR_TREE_DATA_ROOT, version);
  console.log(`Using tree-data ${version} from ${vendorDir}`);

  await mkdir(OUT_DIR, { recursive: true });

  // manifest: name → { file, w, h, sourceFile, sourceIndex, cols, rows }
  const manifest = {};
  let written = 0;

  // Only pull the sheets we actually render in the background layer. Skills,
  // jewel sockets, legion stuff etc. are handled by the tree-icon pipeline;
  // oils/monsters aren't used by the frontend at all.
  const KEEP = /^(ascendancy-background|group-background|background_1024)/;

  for (const [file, entries] of Object.entries(ddsCoords)) {
    if (!KEEP.test(file)) continue;
    const srcPath = join(vendorDir, file);
    let sheet;
    try {
      sheet = await loadSheet(srcPath);
    } catch (e) {
      console.warn(`  skip ${file}: ${e.message}`);
      continue;
    }
    console.log(
      `${file}: ${sheet.tileW}x${sheet.tileH} × ${sheet.arraySize} slices (${sheet.format}), ${Object.keys(entries).length} names`,
    );

    // Emit one webp per unique slice index; multiple names can alias the same
    // slice (e.g. PSGroupBackground1 + PSGroupBackgroundSmallBlank both at 1).
    const emittedByIndex = new Map();
    for (const [name, raw] of Object.entries(entries)) {
      const index = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(index) || index < 1 || index > sheet.arraySize) {
        console.warn(`  ${name}: out-of-range index ${raw} (arraySize=${sheet.arraySize})`);
        continue;
      }
      let outFile = emittedByIndex.get(index);
      if (!outFile) {
        const rgba = decodeSlice(sheet, index);
        if (!rgba) {
          console.warn(`  ${name}: slice ${index} decode failed`);
          continue;
        }
        outFile = `${slug(name)}.webp`;
        const outPath = join(OUT_DIR, outFile);
        await sharp(rgba, { raw: { width: sheet.tileW, height: sheet.tileH, channels: 4 } })
          .webp({ quality: 88, effort: 4 })
          .toFile(outPath);
        emittedByIndex.set(index, outFile);
        written++;
      }
      manifest[name] = {
        file: outFile,
        width: sheet.tileW,
        height: sheet.tileH,
        sourceFile: file,
        sourceIndex: index,
      };
    }
  }

  await writeFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  console.log(`\nWrote ${written} webp files + manifest.json to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
