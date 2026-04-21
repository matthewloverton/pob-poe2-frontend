import { create } from "zustand";
import type { NodeId } from "../types/tree";
import type { ParsedBuild } from "../xml/xmlImport";
import { classStartId } from "./classStarts";

const DEFAULT_CLASS_ID = 2; // Ranger

interface BuildState {
  classId: number;
  classStartId: number | null;
  ascendancyId: number;
  allocated: Set<NodeId>;
  sourceXml: string | null;
  dirty: boolean;
  loadFromParsed: (parsed: ParsedBuild, nodes: NodeId[]) => void;
  setClass: (classId: number) => void;
  allocate: (ids: NodeId[]) => void;
  deallocate: (id: NodeId) => void;
  reset: () => void;
}

function initialState() {
  const startId = classStartId(DEFAULT_CLASS_ID);
  const allocated = new Set<NodeId>(startId != null ? [startId] : []);
  return {
    classId: DEFAULT_CLASS_ID,
    classStartId: startId,
    ascendancyId: 0,
    allocated,
    sourceXml: null,
    dirty: false,
  };
}

// Anything the user has chosen beyond the implicit class-start anchor. When this
// is zero the class is still swappable; once the user allocates anything else the
// class is locked until they reset.
export function countUserAllocated(state: { allocated: Set<NodeId>; classStartId: number | null }): number {
  const anchored = state.classStartId != null && state.allocated.has(state.classStartId) ? 1 : 0;
  return state.allocated.size - anchored;
}

export const useBuildStore = create<BuildState>((set) => ({
  ...initialState(),
  loadFromParsed: (parsed, nodes) => {
    const startId = classStartId(parsed.activeSpec.classId);
    const allocated = new Set<NodeId>(nodes);
    if (startId != null) allocated.add(startId);
    set({
      classId: parsed.activeSpec.classId,
      classStartId: startId,
      ascendancyId: parsed.activeSpec.ascendancyId,
      allocated,
      sourceXml: parsed.sourceXml,
      dirty: false,
    });
  },
  setClass: (newClassId) =>
    set((state) => {
      if (countUserAllocated(state) > 0) return state; // locked
      const newStartId = classStartId(newClassId);
      const allocated = new Set<NodeId>(newStartId != null ? [newStartId] : []);
      return { classId: newClassId, classStartId: newStartId, allocated, dirty: false };
    }),
  allocate: (ids) =>
    set((state) => {
      const next = new Set(state.allocated);
      for (const id of ids) next.add(id);
      return { allocated: next, dirty: true };
    }),
  deallocate: (id) =>
    set((state) => {
      if (id === state.classStartId) return state; // class start is anchored
      const next = new Set(state.allocated);
      next.delete(id);
      return { allocated: next, dirty: true };
    }),
  reset: () => set({ ...initialState() }),
}));
