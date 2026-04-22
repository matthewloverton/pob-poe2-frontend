import { create } from "zustand";
import type { ConfigSchema, ConfigValue } from "./types";
import { parseConfigXml, serializeConfigXml } from "./xmlConfig";
import { useLiveStatsStore } from "../build/liveStatsStore";

let _recomputeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRecompute(values: Record<string, ConfigValue>) {
  if (_recomputeTimer) clearTimeout(_recomputeTimer);
  _recomputeTimer = setTimeout(() => {
    // Only fire when a build is loaded (data !== null means refresh succeeded).
    if (useLiveStatsStore.getState().data === null) return;
    useLiveStatsStore.getState().setConfig(values as Record<string, number | boolean | string>).catch(console.error);
  }, 150);
}

interface ConfigState {
  schema: ConfigSchema | null;
  values: Record<string, ConfigValue>;
  loadSchema: () => Promise<void>;
  loadXml: (xml: string | null) => void;
  set: (key: string, value: ConfigValue) => void;
  toXml: () => string;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  schema: null,
  values: {},
  loadSchema: async () => {
    const res = await fetch("/data/config-schema.json");
    if (!res.ok) return;
    const schema = (await res.json()) as ConfigSchema;
    set({ schema });
  },
  loadXml: (xml) => {
    set({ values: xml ? parseConfigXml(xml) : {} });
  },
  set: (key, value) => {
    set((s) => {
      const nextValues = { ...s.values, [key]: value };
      scheduleRecompute(nextValues);
      return { values: nextValues };
    });
  },
  toXml: () => {
    const { schema, values } = get();
    if (!schema) return `<Config>\n\n</Config>`;
    return serializeConfigXml(schema, values);
  },
}));
