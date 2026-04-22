import { create } from "zustand";
import type { SocketableSchema, SocketableSlotEntry } from "./types";

interface SocketablesState {
  schema: SocketableSchema | null;
  load: () => Promise<void>;
  lookup: (name: string, slotType: string) => SocketableSlotEntry | null;
}

export const useSocketablesStore = create<SocketablesState>((set, get) => ({
  schema: null,
  load: async () => {
    try {
      const res = await fetch("/data/socketables.json");
      if (!res.ok) return;
      const schema = (await res.json()) as SocketableSchema;
      set({ schema });
    } catch (e) {
      console.warn("socketables.json load failed", e);
    }
  },
  lookup: (name, slotType) => {
    const schema = get().schema;
    if (!schema) return null;
    const entry = schema[name];
    if (!entry) return null;
    const hit = entry.slots[slotType];
    if (hit) return hit;
    // Fallback: first available slot.
    const first = Object.values(entry.slots)[0];
    if (first) {
      console.warn(`socketable "${name}" missing slot "${slotType}", using first available`);
      return first;
    }
    return null;
  },
}));
