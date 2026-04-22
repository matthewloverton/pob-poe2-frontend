// Downloads item icons (webp) from RePoE's community-maintained PoE2 data
// (https://repoe-fork.github.io/poe2/) and writes a manifest mapping each
// base-type name (from our PoB-derived public/item-bases.json) to its icon
// file on disk. Re-run after game patches to refresh.
//
// Why RePoE: GGG doesn't publish an official data feed. RePoE-fork tracks
// patches, decompiles the client's BaseItemTypes + visual identity tables,
// and serves pre-converted webps from a static GitHub Pages CDN. Hitting
// their endpoints is cheaper and more reliable than building our own
// .dat/.index bundle reader (which the tree-icons pipeline already shows
// requires the user's full Steam install).
//
// Usage: pnpm extract-item-icons

import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const REPOE_BASE = "https://repoe-fork.github.io/poe2";
const BASE_ITEMS_URL = `${REPOE_BASE}/base_items.min.json`;
const UNIQUES_URL = `${REPOE_BASE}/uniques.min.json`;

const BASES_JSON = join(repoRoot, "public/item-bases.json");
const OUT_DIR = join(repoRoot, "public/items");
const MANIFEST_OUT = join(repoRoot, "public/item-icons-manifest.json");
const UNIQUE_MANIFEST_OUT = join(repoRoot, "public/unique-icons-manifest.json");

const CONCURRENCY = 15;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function downloadOne(url, dest) {
  if (await fileExists(dest)) return "skip";
  const r = await fetch(url);
  if (!r.ok) return "fail";
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(dest, buf);
  return "ok";
}

async function main() {
  const ourBases = JSON.parse(await readFile(BASES_JSON, "utf8"));
  const ourNames = new Set(Object.keys(ourBases));

  console.log(`Fetching RePoE base_items.min.json ...`);
  const repoe = await fetchJson(BASE_ITEMS_URL);
  console.log(`Fetching RePoE uniques.min.json ...`);
  const repoeUniques = await fetchJson(UNIQUES_URL);

  await mkdir(OUT_DIR, { recursive: true });

  // Match our base names against RePoE entries. Both keyed on the human name.
  // RePoE entries store the icon at `visual_identity.dds_file` (a game-relative
  // path); its webp equivalent lives at `${REPOE_BASE}/${dds.replace(.dds,.webp)}`.
  const tasks = [];
  const manifest = {};
  let matched = 0, unmatched = 0;

  for (const raw of Object.values(repoe)) {
    const name = raw?.name;
    if (typeof name !== "string") continue;
    if (!ourNames.has(name)) continue;
    const dds = raw?.visual_identity?.dds_file;
    if (typeof dds !== "string") continue;
    const webpRel = dds.replace(/\.dds$/i, ".webp");
    const url = `${REPOE_BASE}/${webpRel}`;
    const file = basename(webpRel);
    tasks.push({ name, url, dest: join(OUT_DIR, file), file });
    manifest[name] = { file };
    matched++;
  }
  for (const n of ourNames) if (!manifest[n]) unmatched++;

  console.log(`\nMatched ${matched} base names to RePoE entries (${unmatched} unmatched).`);

  // Uniques: each has its own distinct art independent of its base type. We
  // index them in a separate manifest keyed by the unique's display name so
  // the frontend can prefer unique-specific art for UNIQUE-rarity items and
  // fall back to the base icon when an entry is missing.
  const uniqueManifest = {};
  let uniqueMatched = 0;
  for (const raw of Object.values(repoeUniques)) {
    const name = raw?.name;
    const dds = raw?.visual_identity?.dds_file;
    if (typeof name !== "string" || typeof dds !== "string") continue;
    const webpRel = dds.replace(/\.dds$/i, ".webp");
    const url = `${REPOE_BASE}/${webpRel}`;
    const file = basename(webpRel);
    // Uniques live under subfolders (e.g. Armours/BodyArmours/Uniques/...),
    // but we flatten all art into public/items/ and rely on filename
    // uniqueness (RePoE names are already unique per item).
    tasks.push({ name, url, dest: join(OUT_DIR, file), file });
    uniqueManifest[name] = { file };
    uniqueMatched++;
  }
  console.log(`Matched ${uniqueMatched} uniques to RePoE entries.`);

  // Parallel download with a cap.
  let ok = 0, skipped = 0, failed = 0, done = 0;
  const queue = [...tasks];
  async function worker() {
    while (queue.length > 0) {
      const t = queue.shift();
      const res = await downloadOne(t.url, t.dest);
      if (res === "ok") ok++;
      else if (res === "skip") skipped++;
      else failed++;
      done++;
      if (done % 50 === 0 || done === tasks.length) {
        process.stdout.write(
          `\r  progress ${done}/${tasks.length}  ok=${ok} skip=${skipped} fail=${failed} `,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stdout.write("\n");

  await writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(UNIQUE_MANIFEST_OUT, JSON.stringify(uniqueManifest, null, 2), "utf8");
  console.log(
    `\nWrote ${ok} new webps + item-icons-manifest.json + unique-icons-manifest.json (${skipped} already cached, ${failed} failed) to ${OUT_DIR}`,
  );
  if (unmatched > 0) {
    console.log(
      `Note: ${unmatched} bases in item-bases.json had no RePoE match — they'll render without art.`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
