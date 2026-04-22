import treeJson from "../data/tree.json";
import type { NodeId, PassiveTree } from "../types/tree";
import type { AllocMode } from "./buildStore";

// Local cache of the raw tree; avoids repeatedly casting the import.
const tree = treeJson as unknown as PassiveTree;

// Assumed character level when no build is imported. PoB's "max main passives"
// formula is `level - 1 + 24`, so 100 gives 123 which matches the typical
// endgame target.
const ASSUMED_LEVEL = 100;

const MAX_WEAPON_SET = 24;
const MAX_ASCENDANCY = 8;

export interface PointBreakdown {
  main: number;
  maxMain: number;
  ws1: number;
  maxWs1: number;
  ws2: number;
  maxWs2: number;
  ascend: number;
  maxAscend: number;
}

interface Inputs {
  allocated: Set<NodeId>;
  nodeModes: Record<number, AllocMode>;
  classStartId: number | null;
  ascendStartId: number | null;
  level?: number; // optional override once the sidecar reports it
}

interface NodePointShape {
  ascendancyName?: string;
  /** Alternative inside a 2/3-choice notable — allocated but doesn't consume
   *  a point. PoB's CountAllocNodes skips these. */
  isMultipleChoiceOption?: boolean;
  /** Free-allocate nodes (e.g. certain free ascend paths) — also skipped. */
  isFreeAllocate?: boolean;
}

function nodePointInfo(id: NodeId): NodePointShape | undefined {
  return tree.nodes[String(id)] as unknown as NodePointShape | undefined;
}

export function computePoints(inputs: Inputs): PointBreakdown {
  // Mirror PoB's Build.lua:856 display semantics: main-pool count is every
  // non-ascend allocated node MINUS the overlap of min(ws1, ws2). Weapon-set
  // bank nodes still count toward main until their counterpart in the other
  // bank is allocated, at which point they "pair up" and stop consuming a
  // main passive point.
  let totalNonAscend = 0;
  let ws1 = 0;
  let ws2 = 0;
  let ascend = 0;
  for (const id of inputs.allocated) {
    if (id === inputs.classStartId) continue;
    if (id === inputs.ascendStartId) continue;
    const info = nodePointInfo(id);
    // Match PoB's CountAllocNodes: alternatives inside a multi-choice notable
    // and explicit free-allocate nodes don't consume a passive point.
    if (info?.isMultipleChoiceOption || info?.isFreeAllocate) continue;
    if (info?.ascendancyName) {
      ascend++;
      continue;
    }
    totalNonAscend++;
    const mode = inputs.nodeModes[id] ?? 0;
    if (mode === 1) ws1++;
    else if (mode === 2) ws2++;
  }
  const level = inputs.level ?? ASSUMED_LEVEL;
  const maxMain = Math.max(level - 1 + 24, 0);
  const main = totalNonAscend - Math.min(ws1, ws2);
  return {
    main,
    maxMain,
    ws1,
    maxWs1: MAX_WEAPON_SET,
    ws2,
    maxWs2: MAX_WEAPON_SET,
    ascend,
    maxAscend: MAX_ASCENDANCY,
  };
}

// Given a proposed set of newly-allocated ids at a given mode, classify each
// and return which pool would overflow (if any). Used pre-allocation to gate
// the click and surface a toast instead of silently over-allocating.
export function checkAllocation(
  current: PointBreakdown,
  pathIds: NodeId[],
  modeForNewNodes: AllocMode,
): { ok: true } | { ok: false; reason: string } {
  let addNonAscend = 0;
  let addWs1 = 0;
  let addWs2 = 0;
  let addAscend = 0;
  for (const id of pathIds) {
    const info = nodePointInfo(id);
    if (info?.isMultipleChoiceOption || info?.isFreeAllocate) continue;
    if (info?.ascendancyName) {
      addAscend++;
      continue;
    }
    addNonAscend++;
    if (modeForNewNodes === 1) addWs1++;
    else if (modeForNewNodes === 2) addWs2++;
  }
  // Re-apply PoB's overlap rule against the projected totals.
  const newWs1 = current.ws1 + addWs1;
  const newWs2 = current.ws2 + addWs2;
  const currentTotalNonAscend = current.main + Math.min(current.ws1, current.ws2);
  const newMain = currentTotalNonAscend + addNonAscend - Math.min(newWs1, newWs2);
  if (newMain > current.maxMain) {
    return { ok: false, reason: `Main tree: ${newMain} / ${current.maxMain} exceeds limit` };
  }
  if (newWs1 > current.maxWs1) {
    return { ok: false, reason: `Weapon Set 1: ${newWs1} / ${current.maxWs1} exceeds limit` };
  }
  if (newWs2 > current.maxWs2) {
    return { ok: false, reason: `Weapon Set 2: ${newWs2} / ${current.maxWs2} exceeds limit` };
  }
  if (current.ascend + addAscend > current.maxAscend) {
    return { ok: false, reason: `Ascendancy: ${current.ascend + addAscend} / ${current.maxAscend} exceeds limit` };
  }
  return { ok: true };
}
