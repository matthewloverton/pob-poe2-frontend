import { create } from "zustand";

export type AppTab = "tree" | "items" | "config";

interface TabState {
  tab: AppTab;
  setTab: (tab: AppTab) => void;
}

// Which main panel the user is looking at. Sidebar stays visible across tabs;
// only the big center pane swaps. Persistence isn't needed today — the tree
// is the expected first-land surface.
export const useTabStore = create<TabState>((set) => ({
  tab: "tree",
  setTab: (tab) => set({ tab }),
}));
