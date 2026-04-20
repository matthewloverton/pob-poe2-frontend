import { create } from "zustand";
import type { NodeId } from "../types/tree";
import type { ParsedBuild } from "../xml/xmlImport";

interface BuildState {
  classId: number;
  ascendancyId: number;
  allocated: Set<NodeId>;
  sourceXml: string | null;
  dirty: boolean;
  loadFromParsed: (parsed: ParsedBuild, nodes: NodeId[]) => void;
  allocate: (ids: NodeId[]) => void;
  deallocate: (id: NodeId) => void;
  reset: () => void;
}

const initial = {
  classId: 0,
  ascendancyId: 0,
  allocated: new Set<NodeId>(),
  sourceXml: null,
  dirty: false,
} as const;

export const useBuildStore = create<BuildState>((set) => ({
  ...initial,
  loadFromParsed: (parsed, nodes) =>
    set({
      classId: parsed.activeSpec.classId,
      ascendancyId: parsed.activeSpec.ascendancyId,
      allocated: new Set(nodes),
      sourceXml: parsed.sourceXml,
      dirty: false,
    }),
  allocate: (ids) =>
    set((state) => {
      const next = new Set(state.allocated);
      for (const id of ids) next.add(id);
      return { allocated: next, dirty: true };
    }),
  deallocate: (id) =>
    set((state) => {
      const next = new Set(state.allocated);
      next.delete(id);
      return { allocated: next, dirty: true };
    }),
  reset: () => set({ ...initial, allocated: new Set() }),
}));
