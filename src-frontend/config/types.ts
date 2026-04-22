export type ConfigValue = number | boolean | string;

export interface ConfigGate {
  ifSkillData?: string;
  ifCond?: string;
  ifMod?: string;
}

export interface ConfigListItem {
  val: number | string;
  label: string;
}

export type ConfigOption =
  | { var: string; type: "check"; label: string; default?: boolean; tooltip?: string; gate?: ConfigGate }
  | { var: string; type: "count"; label: string; default?: number; tooltip?: string; gate?: ConfigGate }
  | { var: string; type: "list"; label: string; list: ConfigListItem[]; defaultIndex?: number; tooltip?: string; gate?: ConfigGate };

export interface ConfigSection {
  name: string;
  options: ConfigOption[];
}

export interface ConfigSchema {
  sections: ConfigSection[];
}
