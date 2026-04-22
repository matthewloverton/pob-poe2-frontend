import { create } from "zustand";
import type { ConfigSchema, ConfigValue } from "./types";
import { parseConfigXml, serializeConfigXml } from "./xmlConfig";

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
    set((s) => ({ values: { ...s.values, [key]: value } }));
  },
  toXml: () => {
    const { schema, values } = get();
    if (!schema) return `<Config>\n\n</Config>`;
    return serializeConfigXml(schema, values);
  },
}));
