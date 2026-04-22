import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useBuildStore, type AllocMode } from "./buildStore";

export interface SkillGroup {
  i: number;
  label: string;
  enabled: boolean;
}

export interface PointCounts {
  main?: number;
  max_main?: number;
  weaponSet1?: number;
  weaponSet2?: number;
  ascend?: number;
  max_ascend?: number;
}

export interface LiveStats {
  ready: boolean;
  class?: string;
  ascendancy?: string;
  level?: number;
  stats: Record<string, number | string | boolean>;
  skills?: SkillGroup[];
  mainSocketGroup?: number;
  mainSkillName?: string;
  points?: PointCounts;
}

// Defensive numbers that shouldn't flicker when the user switches skills. We
// re-sample these whenever the build or allocation changes, and reuse the
// snapshot when only the main skill changed.
const DEFENSIVE_KEYS = [
  "TotalEHP",
  "PhysicalMaximumHitTaken",
  "FireMaximumHitTaken",
  "ColdMaximumHitTaken",
  "LightningMaximumHitTaken",
  "ChaosMaximumHitTaken",
] as const;

type DefensiveSnapshot = Partial<Record<(typeof DEFENSIVE_KEYS)[number], number>>;

function snapshotDefensive(stats: LiveStats["stats"] | undefined): DefensiveSnapshot {
  const out: DefensiveSnapshot = {};
  if (!stats) return out;
  for (const key of DEFENSIVE_KEYS) {
    const v = stats[key];
    if (typeof v === "number") out[key] = v;
  }
  return out;
}

// The hero block shows the best-DPS skill and its number. Captured at the same
// time as the defensive snapshot so it survives user-driven skill swaps — the
// panel numbers still follow the dropdown, but the headline stays anchored.
interface Headline {
  dps?: number;
  skill?: string;
}

function snapshotHeadline(data: LiveStats): Headline {
  const dps = data.stats?.CombinedDPS;
  return {
    dps: typeof dps === "number" ? dps : undefined,
    skill: data.mainSkillName,
  };
}

// Null when no import is running. Drives the build-loader overlay so it only
// appears on explicit imports (refresh) and not on in-app allocation recalcs.
export type ImportPhase = "Importing Build" | "Calculating Stats" | null;

interface LiveStatsState {
  data: LiveStats | null;
  defence: DefensiveSnapshot;
  headline: Headline;
  importPhase: ImportPhase;
  error: string | null;
  loading: boolean;
  refresh: (xml: string | null) => Promise<void>;
  setMainSkill: (index: number) => Promise<void>;
  setAllocated: (ids: number[], overrides?: Record<number, number>) => Promise<void>;
}

// Shared store driven from App — BuildMeta (top bar) and Sidebar (stats panel)
// both read from the same snapshot so we only hit the sidecar once per XML change.
export const useLiveStatsStore = create<LiveStatsState>((set) => ({
  data: null,
  defence: {},
  headline: {},
  importPhase: null,
  error: null,
  loading: false,
  refresh: async (xml) => {
    if (!xml) {
      set({
        data: null,
        defence: {},
        headline: {},
        importPhase: null,
        error: null,
        loading: false,
      });
      return;
    }
    set({ loading: true, importPhase: "Importing Build", error: null });
    try {
      await invoke("lua_load_pob");
      await invoke("lua_load_build", { xml });
      // Pull the authoritative allocation + weapon-set modes + multi-option
      // picks from PoB so the frontend set includes WS1/WS2 nodes the tree
      // URL didn't encode and honors the build's saved attribute choices.
      try {
        const state = await invoke<{
          allocated: number[];
          modes: Record<string, number>;
          overrides?: Record<string, number>;
        }>("lua_get_alloc_state");
        const modes: Record<number, AllocMode> = {};
        for (const [k, v] of Object.entries(state.modes)) {
          if (v === 1 || v === 2) modes[Number(k)] = v as AllocMode;
        }
        const overrides: Record<number, number> = {};
        for (const [k, v] of Object.entries(state.overrides ?? {})) overrides[Number(k)] = v;
        useBuildStore.getState().syncAllocation(state.allocated, modes, overrides);
      } catch { /* fall through — stats still work with partial allocation */ }
      set((prev) => ({ ...prev, importPhase: "Calculating Stats" }));
      const data = await invoke<LiveStats>("lua_compute_stats");
      set({
        data,
        defence: snapshotDefensive(data.stats),
        headline: snapshotHeadline(data),
        importPhase: null,
        error: null,
        loading: false,
      });
    } catch (e) {
      set({
        data: null,
        defence: {},
        headline: {},
        importPhase: null,
        error: String(e),
        loading: false,
      });
    }
  },
  setMainSkill: async (index) => {
    set((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await invoke<LiveStats>("lua_set_main_skill", { index });
      // Preserve both defence and headline — user-driven skill changes only
      // move the panel stats, not the headline numbers.
      set((prev) => ({ ...prev, data, error: null, loading: false }));
    } catch (e) {
      set((prev) => ({ ...prev, error: String(e), loading: false }));
    }
  },
  setAllocated: async (ids, overrides) => {
    set((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await invoke<LiveStats>("lua_set_allocated", { ids, overrides });
      set({
        data,
        defence: snapshotDefensive(data.stats),
        headline: snapshotHeadline(data),
        error: null,
        loading: false,
      });
    } catch (e) {
      set((prev) => ({ ...prev, error: String(e), loading: false }));
    }
  },
}));
