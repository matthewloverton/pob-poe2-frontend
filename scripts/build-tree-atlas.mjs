// Packs every icon under public/tree-icons/ into one or more sprite-sheet atlases,
// along with a manifest mapping original paths → {atlas, x, y, w, h}.
//
// Run after scripts/extract-tree-icons.mjs. Collapses 540 individual HTTP requests
// into a handful of atlas fetches and enables Pixi to batch-render all node icons.
//
// Output:
//   public/tree-icons/atlas/atlas-0.webp, atlas-1.webp, ...
//   public/tree-icons/atlas/manifest.json

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { MaxRectsPacker } from "maxrects-packer";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const ICONS_ROOT = join(repoRoot, "public/tree-icons");
const OUT_DIR = join(ICONS_ROOT, "atlas");

const ATLAS_SIZE = 2048;
const PADDING = 2;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === OUT_DIR) continue; // don't recurse into our own output
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".webp")) {
      yield full;
    }
  }
}

function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

async function main() {
  console.log(`Scanning ${ICONS_ROOT}`);
  const iconPaths = [];
  for await (const p of walk(ICONS_ROOT)) iconPaths.push(p);
  console.log(`Found ${iconPaths.length} icons`);

  const icons = [];
  for (const fullPath of iconPaths) {
    const srcBuf = await readFile(fullPath);
    const { width, height } = await sharp(srcBuf).metadata();
    if (!width || !height) throw new Error(`Missing dims for ${fullPath}`);
    // Clip each icon to a circle using a dest-in composite with a white-circle
    // SVG mask. The atlas then holds circle-shaped icons, so runtime can render
    // them without a per-sprite mask and nothing bleeds past the node border.
    const r = Math.min(width, height) / 2;
    const maskSvg = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="#fff"/></svg>`,
    );
    const buf = await sharp(srcBuf)
      .composite([{ input: maskSvg, blend: "dest-in" }])
      .webp({ quality: 95, effort: 4 })
      .toBuffer();
    const relPath = toPosix(relative(ICONS_ROOT, fullPath));
    icons.push({ relPath, width, height, buf });
  }

  const packer = new MaxRectsPacker(ATLAS_SIZE, ATLAS_SIZE, PADDING, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
  });
  packer.addArray(
    icons.map((i) => ({ width: i.width, height: i.height, data: i })),
  );
  console.log(`Packed into ${packer.bins.length} atlas bin(s)`);

  // Clear prior output so orphaned atlases don't linger.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const frames = {};
  const atlases = [];

  for (let i = 0; i < packer.bins.length; i++) {
    const bin = packer.bins[i];
    const composites = [];
    for (const rect of bin.rects) {
      const icon = rect.data;
      composites.push({ input: icon.buf, left: rect.x, top: rect.y });
      frames[icon.relPath] = { a: i, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    }

    const atlasName = `atlas-${i}.webp`;
    const atlasPath = join(OUT_DIR, atlasName);
    await sharp({
      create: {
        width: ATLAS_SIZE,
        height: ATLAS_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ quality: 90, effort: 5 })
      .toFile(atlasPath);
    atlases.push(atlasName);
    console.log(`  wrote ${atlasName}  (${bin.rects.length} sprites)`);
  }

  const manifest = {
    atlasSize: ATLAS_SIZE,
    atlases,
    frames,
  };
  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest.json — ${Object.keys(frames).length} frames across ${atlases.length} atlas(es).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
