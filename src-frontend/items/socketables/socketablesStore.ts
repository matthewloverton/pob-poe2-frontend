import { create } from "zustand";
import type { SocketableSchema, SocketableSlotEntry } from "./types";

interface SocketablesState {
  schema: SocketableSchema | null;
  load: () => Promise<void>;
  /** Look up a socketable entry. `candidates` is an ordered list of slot-type
   *  strings to try (e.g. ["helmet", "armour"] or ["weapon", "caster"]); the
   *  first hit wins. Falls back to the first available slot if none match. */
  lookup: (name: string, candidates: string[]) => SocketableSlotEntry | null;
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
  lookup: (name, candidates) => {
    const schema = get().schema;
    if (!schema) return null;
    const entry = schema[name];
    if (!entry) return null;
    for (const slot of candidates) {
      const hit = entry.slots[slot];
      if (hit) return hit;
    }
    const first = Object.values(entry.slots)[0];
    if (first) {
      console.warn(`socketable "${name}" missing slots [${candidates.join(", ")}], using first available`);
      return first;
    }
    return null;
  },
}));
