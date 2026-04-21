import { create } from "zustand";
import type { NodeId } from "../types/tree";

interface FocusStore {
  pendingFocus: NodeId | null;
  requestFocus: (id: NodeId) => void;
  clear: () => void;
}

export const useFocusStore = create<FocusStore>((set) => ({
  pendingFocus: null,
  requestFocus: (id) => set({ pendingFocus: id }),
  clear: () => set({ pendingFocus: null }),
}));
