import treeJson from "../data/tree.json";
import type { PassiveTree } from "../types/tree";

// classId throughout the app is a ZERO-BASED INDEX into tree.classes[], matching
// PoB's XML encoding (see loadSave.ts). This table is derived from the tree at
// module load so the ordering stays in sync with PoB rather than hard-coded.
export const CLASS_NAMES: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  const classes = ((treeJson as unknown as { classes?: Array<{ name: string }> }).classes) ?? [];
  classes.forEach((c, i) => { out[i] = c.name; });
  return out;
})();

// classesStart in tree.nodes uses class NAMES (not ids). Build classId (0-based
// index) → node id via the name bridge. Sibling classes share a start node
// (Ranger/Huntress, Warrior/Marauder, etc.).
const START_ID_BY_CLASS: Record<number, number> = (() => {
  const out: Record<number, number> = {};
  const tree = treeJson as unknown as PassiveTree;
  for (const [idxStr, name] of Object.entries(CLASS_NAMES)) {
    const idx = Number(idxStr);
    for (const [nidStr, n] of Object.entries(tree.nodes)) {
      const starts = (n as unknown as { classesStart?: string[] }).classesStart;
      if (Array.isArray(starts) && starts.includes(name)) {
        out[idx] = Number(nidStr);
        break;
      }
    }
  }
  return out;
})();

export function classStartId(classId: number): number | null {
  return START_ID_BY_CLASS[classId] ?? null;
}

// The index of Ranger in tree.classes[]. Used as the default when no build is
// imported. Scanned at load time so it survives tree-data reordering.
// Ordered list of ascendancy names for a given class. Index position equals the
// ascendancyId we store — same convention PoB uses in `<Spec ascendClassId="N">`.
// Returns [] for classes without ascendancies (or unknown class).
export function ascendanciesFor(classId: number): string[] {
  const classes = ((treeJson as unknown as {
    classes?: Array<{ ascendancies?: Array<{ name: string }> }>;
  }).classes) ?? [];
  return (classes[classId]?.ascendancies ?? []).map((a) => a.name);
}

// Map ascendancy name → root node id. In the PoE2 tree the root node of each
// ascendancy subtree is the one whose `name` equals the ascendancy name (e.g.
// the "Deadeye" node is the Deadeye root). Built once at load.
const ASCEND_ROOT_BY_NAME: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  const tree = treeJson as unknown as PassiveTree;
  for (const [nidStr, n] of Object.entries(tree.nodes)) {
    const node = n as unknown as { ascendancyName?: string; name?: string };
    if (node.ascendancyName && node.name === node.ascendancyName) {
      out[node.ascendancyName] = Number(nidStr);
    }
  }
  return out;
})();

// Given the active classId and ascendancyId (1-based; 0 means None), return
// the ascend-subtree root node id, or null when no ascendancy is selected.
export function ascendStartIdFor(classId: number, ascendancyId: number): number | null {
  if (ascendancyId <= 0) return null;
  const name = ascendanciesFor(classId)[ascendancyId - 1];
  if (!name) return null;
  return ASCEND_ROOT_BY_NAME[name] ?? null;
}

export const DEFAULT_CLASS_ID: number = (() => {
  for (const [idxStr, name] of Object.entries(CLASS_NAMES)) {
    if (name === "Ranger") return Number(idxStr);
  }
  return 0;
})();
