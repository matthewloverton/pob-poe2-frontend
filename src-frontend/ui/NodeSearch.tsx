import { useMemo, useState, useRef, useEffect } from "react";
import treeData from "../data/tree.json";
import type { PassiveNode, PassiveTree } from "../types/tree";
import { useFocusStore } from "../tree/focusStore";

const tree = treeData as unknown as PassiveTree;

interface SearchEntry {
  id: number;
  name: string;
  kind: string;
}

const searchIndex: SearchEntry[] = Object.entries(tree.nodes)
  .filter(([, n]) => !n["isOnlyImage"] && !n["isProxy"] && typeof n.name === "string" && (n.name as string).length > 0)
  .map(([idStr, n]) => ({
    id: Number(idStr),
    name: String(n.name),
    kind: n.isKeystone ? "Keystone" : n.isNotable ? "Notable" : n.isJewelSocket ? "Socket" : "Passive",
  }));

function filterMatches(query: string, limit = 8): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchEntry[] = [];
  for (const entry of searchIndex) {
    if (entry.name.toLowerCase().includes(q)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function NodeSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestFocus = useFocusStore((s) => s.requestFocus);

  const matches = useMemo(() => filterMatches(query), [query]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const select = (id: number) => {
    requestFocus(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search nodes…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && matches[activeIdx]) { e.preventDefault(); select(matches[activeIdx].id); }
          else if (e.key === "Escape") { setQuery(""); setOpen(false); inputRef.current?.blur(); }
        }}
        className="w-56 bg-bg-elevated border border-border px-3 py-1.5 font-mono text-[11px] text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-muted"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-80 border border-border bg-bg-elevated shadow-xl font-mono text-xs max-h-72 overflow-y-auto">
          {matches.map((m, i) => (
            <li
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); select(m.id); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-1.5 cursor-pointer border-b border-border-subtle flex justify-between gap-3 ${
                i === activeIdx ? "bg-border/50 text-fg" : "text-fg-dim"
              }`}
            >
              <span className="truncate">{m.name}</span>
              <span className="text-[9px] uppercase tracking-widest text-fg-muted">{m.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
