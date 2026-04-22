import { XMLParser } from "fast-xml-parser";
import type { ConfigValue, ConfigSchema, ConfigOption } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => name === "Input",
});

export function parseConfigXml(xml: string): Record<string, ConfigValue> {
  const parsed = parser.parse(xml);
  const inputs = parsed?.Build?.Config?.Input ?? parsed?.Config?.Input ?? [];
  const out: Record<string, ConfigValue> = {};
  for (const input of inputs as Array<Record<string, string>>) {
    const name = input.name;
    if (!name) continue;
    if (input.boolean !== undefined) out[name] = input.boolean === "true";
    else if (input.number !== undefined) out[name] = Number(input.number);
    else if (input.string !== undefined) out[name] = input.string;
  }
  return out;
}

function optionDefault(opt: ConfigOption): ConfigValue | undefined {
  if (opt.type === "check") return opt.default ?? false;
  if (opt.type === "count") return opt.default;
  if (opt.type === "list" && opt.defaultIndex !== undefined) {
    return opt.list[opt.defaultIndex - 1]?.val;
  }
  return undefined;
}

function optionByVar(schema: ConfigSchema): Map<string, ConfigOption> {
  const m = new Map<string, ConfigOption>();
  for (const s of schema.sections) for (const o of s.options) m.set(o.var, o);
  return m;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
          .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emitInput(name: string, value: ConfigValue, opt: ConfigOption | undefined): string {
  const n = escape(name);
  if (typeof value === "boolean") return `<Input name="${n}" boolean="${value}"/>`;
  if (typeof value === "number") return `<Input name="${n}" number="${value}"/>`;
  if (opt?.type === "list" && opt.list.some((i) => typeof i.val === "number")) {
    return `<Input name="${n}" number="${value}"/>`;
  }
  return `<Input name="${n}" string="${escape(String(value))}"/>`;
}

export function serializeConfigXml(
  schema: ConfigSchema,
  values: Record<string, ConfigValue>,
): string {
  const byVar = optionByVar(schema);
  const lines: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const opt = byVar.get(name);
    if (opt) {
      const def = optionDefault(opt);
      if (def !== undefined && def === value) continue;
    }
    lines.push("  " + emitInput(name, value, opt));
  }
  return `<Config>\n${lines.join("\n")}\n</Config>`;
}
