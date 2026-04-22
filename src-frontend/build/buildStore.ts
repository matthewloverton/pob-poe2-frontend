import { create } from "zustand";
import type { NodeId } from "../types/tree";
import type { ParsedBuild } from "../xml/xmlImport";
import { ascendStartIdFor, classStartId, DEFAULT_CLASS_ID } from "./classStarts";

// 0 = main tree / ascendancy (default), 1 = weapon set 1, 2 = weapon set 2.
// Only weapon-set points are mode-stamped; nodes inside the ascendancy subtree
// always allocate as mode 0 regardless of the current pill, since they belong
// to their own separate pool.
export type AllocMode = 0 | 1 | 2;

interface BuildState {
  classId: number;
  classStartId: number | null;
  ascendancyId: number;
  ascendStartId: number | null;
  allocated: Set<NodeId>;
  nodeModes: Record<number, AllocMode>;
  // "+5 to any attribute" nodes and other multi-option nodes record the
  // picked option index here, keyed by node id. 0-based against the node's
  // `options` array (e.g. 0=Str, 1=Dex, 2=Int for attribute choices).
  nodeOverrides: Record<number, number>;
  allocMode: AllocMode;
  sourceXml: string | null;
  dirty: boolean;
  loadFromParsed: (parsed: ParsedBuild, nodes: NodeId[], overrides?: Record<number, number>) => void;
  setClass: (classId: number) => void;
  setAscendancy: (ascendancyId: number) => void;
  setAllocMode: (mode: AllocMode) => void;
  allocate: (ids: NodeId[]) => void;
  deallocate: (id: NodeId) => void;
  setNodeOverride: (nodeId: NodeId, optionIndex: number) => void;
  // Replace allocation + per-node modes in one shot. Used after an import so
  // the Lua-side-authoritative state (which knows WS1/WS2 + overrides)
  // supersedes our URL-only derived set.
  syncAllocation: (
    allocated: NodeId[],
    nodeModes: Record<number, AllocMode>,
    overrides?: Record<number, number>,
  ) => void;
  reset: () => void;
}

function initialState() {
  const startId = classStartId(DEFAULT_CLASS_ID);
  const allocated = new Set<NodeId>(startId != null ? [startId] : []);
  return {
    classId: DEFAULT_CLASS_ID,
    classStartId: startId,
    ascendancyId: 0,
    ascendStartId: null as number | null,
    allocated,
    nodeModes: {} as Record<number, AllocMode>,
    nodeOverrides: {} as Record<number, number>,
    allocMode: 0 as AllocMode,
    sourceXml: null,
    dirty: false,
  };
}

// Anything the user has chosen beyond the implicit class-start anchor. When this
// is zero the class is still swappable; once the user allocates anything else the
// class is locked until they reset.
export function countUserAllocated(state: {
  allocated: Set<NodeId>;
  classStartId: number | null;
  ascendStartId?: number | null;
}): number {
  let anchored = 0;
  if (state.classStartId != null && state.allocated.has(state.classStartId)) anchored++;
  if (state.ascendStartId != null && state.allocated.has(state.ascendStartId)) anchored++;
  return state.allocated.size - anchored;
}

export const useBuildStore = create<BuildState>((set) => ({
  ...initialState(),
  loadFromParsed: (parsed, nodes, overrides) => {
    const startId = classStartId(parsed.activeSpec.classId);
    const ascStartId = ascendStartIdFor(parsed.activeSpec.classId, parsed.activeSpec.ascendancyId);
    const allocated = new Set<NodeId>(nodes);
    if (startId != null) allocated.add(startId);
    if (ascStartId != null) allocated.add(ascStartId);
    set({
      classId: parsed.activeSpec.classId,
      classStartId: startId,
      ascendancyId: parsed.activeSpec.ascendancyId,
      ascendStartId: ascStartId,
      allocated,
      nodeOverrides: overrides ?? {},
      sourceXml: parsed.sourceXml,
      dirty: false,
    });
  },
  setClass: (newClassId) =>
    set((state) => {
      if (countUserAllocated(state) > 0) return state; // locked
      const newStartId = classStartId(newClassId);
      const allocated = new Set<NodeId>(newStartId != null ? [newStartId] : []);
      return {
        classId: newClassId,
        classStartId: newStartId,
        allocated,
        nodeOverrides: {},
        ascendancyId: 0,
        ascendStartId: null,
        dirty: false,
      };
    }),
  setAscendancy: (ascendancyId) =>
    set((state) => {
      const newAscStart = ascendStartIdFor(state.classId, ascendancyId);
      const allocated = new Set<NodeId>(state.allocated);
      // Swap the ascend-subtree anchor in the allocated set so pathing has a
      // seed inside the new subtree.
      if (state.ascendStartId != null) allocated.delete(state.ascendStartId);
      if (newAscStart != null) allocated.add(newAscStart);
      return { ascendancyId, ascendStartId: newAscStart, allocated, dirty: true };
    }),
  setAllocMode: (mode) => set({ allocMode: mode }),
  syncAllocation: (allocatedArr, modes, overrides) =>
    set((state) => {
      const allocated = new Set<NodeId>(allocatedArr);
      if (state.classStartId != null) allocated.add(state.classStartId);
      if (state.ascendStartId != null) allocated.add(state.ascendStartId);
      return {
        allocated,
        nodeModes: { ...modes },
        nodeOverrides: overrides ? { ...overrides } : state.nodeOverrides,
      };
    }),
  allocate: (ids) =>
    set((state) => {
      const next = new Set(state.allocated);
      const modes = { ...state.nodeModes };
      for (const id of ids) {
        next.add(id);
        if (state.allocMode !== 0) modes[id] = state.allocMode;
      }
      return { allocated: next, nodeModes: modes, dirty: true };
    }),
  deallocate: (id) =>
    set((state) => {
      if (id === state.classStartId) return state; // class start is anchored
      if (id === state.ascendStartId) return state; // ascend start is anchored
      const next = new Set(state.allocated);
      next.delete(id);
      const modes = { ...state.nodeModes };
      delete modes[id];
      const overrides = { ...state.nodeOverrides };
      delete overrides[id as unknown as number];
      return { allocated: next, nodeModes: modes, nodeOverrides: overrides, dirty: true };
    }),
  setNodeOverride: (nodeId, optionIndex) =>
    set((state) => ({
      nodeOverrides: { ...state.nodeOverrides, [nodeId as unknown as number]: optionIndex },
      dirty: true,
    })),
  reset: () => set({ ...initialState() }),
}));
