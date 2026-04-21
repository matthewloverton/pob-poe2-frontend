import treeJson from "../data/tree.json";
import type { PassiveTree } from "../types/tree";

// Numeric class IDs mirror PoB's; only PoE2 base classes are user-selectable.
export const CLASS_NAMES: Record<number, string> = {
  1: "Witch",
  2: "Ranger",
  3: "Warrior",
  4: "Mercenary",
  5: "Monk",
  6: "Sorceress",
};

// Map numeric class ID → the node id that anchors pathing for that class. Built
// once by scanning tree.json for nodes whose `classesStart` array contains the
// class name. In PoE2 sibling classes share a start (Ranger/Huntress, etc.).
const START_ID_BY_CLASS: Record<number, number> = (() => {
  const out: Record<number, number> = {};
  const tree = treeJson as unknown as PassiveTree;
  for (const [idStr, name] of Object.entries(CLASS_NAMES)) {
    const classId = Number(idStr);
    for (const [nidStr, n] of Object.entries(tree.nodes)) {
      const starts = (n as unknown as { classesStart?: string[] }).classesStart;
      if (Array.isArray(starts) && starts.includes(name)) {
        out[classId] = Number(nidStr);
        break;
      }
    }
  }
  return out;
})();

export function classStartId(classId: number): number | null {
  return START_ID_BY_CLASS[classId] ?? null;
}
