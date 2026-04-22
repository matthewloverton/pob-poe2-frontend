import { useMemo, useState } from "react";
import { Panel } from "../ui/Panel";
import { useConfigStore } from "./configStore";
import { ConfigRow } from "./ConfigRow";
import type { ConfigOption } from "./types";

export function ConfigPanel() {
  const schema = useConfigStore((s) => s.schema);
  const values = useConfigStore((s) => s.values);
  const setValue = useConfigStore((s) => s.set);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!schema) return [];
    if (!q) return schema.sections;
    return schema.sections
      .map((s) => ({
        ...s,
        options: s.options.filter((o) => o.label?.toLowerCase().includes(q)),
      }))
      .filter((s) => s.options.length > 0);
  }, [schema, q]);

  if (!schema) {
    return (
      <Panel>
        <p>Config schema not loaded. Run <code>just extract</code> and reload.</p>
      </Panel>
    );
  }

  return (
    <div className="config-panel">
      <div className="config-toolbar">
        <input
          type="search"
          placeholder="Search config…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-72 bg-bg-elevated border border-border px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted"
        />
      </div>
      <div className="config-sections">
        {filtered.map((section) => (
          <Panel key={section.name} title={section.name}>
            <div className="config-grid">
              {section.options.map((opt: ConfigOption, i: number) => (
                <ConfigRow
                  key={`${section.name}:${opt.var}:${i}`}
                  option={opt}
                  value={values[opt.var]}
                  onChange={(v) => setValue(opt.var, v)}
                />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
