import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useLiveStatsStore } from "../build/liveStatsStore";
import { PANELS, type Row, type Fmt, type Panel as PanelDef } from "../build/statFields";

function fmtInt(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtDec(n: unknown, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function format(v: unknown, fmt: Fmt): string {
  if (typeof v !== "number") return typeof v === "string" ? v : typeof v === "boolean" ? String(v) : "—";
  if (!Number.isFinite(v)) return "—";
  switch (fmt) {
    case "int": return Math.round(v).toLocaleString();
    case "dec": return fmtDec(v, 1);
    case "dec2": return fmtDec(v, 2);
    case "res": {
      const sign = v > 0 ? "+" : "";
      return `${sign}${Math.round(v)}%`;
    }
    case "pct": return `${Math.round(v)}%`;
    case "pctFrac": return `${Math.round(v * 100)}%`;
    case "x": return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
    case "sec": return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}s`;
    default: return String(v);
  }
}

function rowIsVisible(row: Row, v: unknown, frac?: unknown): boolean {
  // Fraction rows stay visible as long as either side is nonzero (useful for
  // charge types that start at 0/N — we still want to show the cap).
  if (row.fractionKey) {
    const a = typeof v === "number" && Number.isFinite(v) ? v : 0;
    const b = typeof frac === "number" && Number.isFinite(frac) ? frac : 0;
    return a !== 0 || b !== 0;
  }
  if (v === undefined || v === null) return false;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return false;
    if (row.hideIfEqual !== undefined && v === row.hideIfEqual) return false;
    if (row.hideIfZero !== false && v === 0) return false;
  } else if (typeof v === "string") {
    if (v === "") return false;
  } else if (typeof v === "boolean") {
    if (!v) return false;
  }
  return true;
}

function StatLine({ row, stats }: { row: Row; stats: Record<string, number | string | boolean> }) {
  const v = stats[row.key];
  let value: string;
  if (row.fractionKey) {
    const fv = stats[row.fractionKey];
    const a = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
    const b = typeof fv === "number" && Number.isFinite(fv) ? Math.round(fv) : 0;
    value = `${a}/${b}`;
  } else {
    value = format(v, row.fmt);
  }
  let suffix: string | null = null;
  if (row.suffixKey) {
    const sv = stats[row.suffixKey];
    const hide = row.suffixHideIfZero !== false && typeof sv === "number" && sv === 0;
    if (!hide && sv !== undefined) suffix = format(sv, row.suffixFmt ?? row.fmt);
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-[1px] leading-tight">
      <span className={`text-[11px] ${row.accent ?? "text-fg-muted"}`}>{row.label}</span>
      <span className="font-mono text-[11px] text-fg whitespace-nowrap">
        {value}
        {suffix && <span className="ml-1 text-fg-dim">({suffix})</span>}
      </span>
    </div>
  );
}

// Section header used as a divider + collapse toggle. No border boxes — the
// whole sidebar is one flowing list. Disabled (non-clickable) when there's
// nothing under the section to hide/reveal.
function SectionHeader({
  title,
  expanded,
  hasExpandable,
  onClick,
}: {
  title: string;
  expanded: boolean;
  hasExpandable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasExpandable}
      className="mt-2 mb-1 flex w-full items-center gap-1.5 border-b border-border pb-0.5 text-left disabled:cursor-default"
    >
      <span className={`w-3 font-mono text-[9px] ${hasExpandable ? "text-fg-dim" : "text-fg-muted/40"}`}>
        {hasExpandable ? (expanded ? "▼" : "▶") : "▼"}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg">
        {title}
      </span>
    </button>
  );
}

function Section({
  panel,
  stats,
  expanded,
  onToggle,
}: {
  panel: PanelDef;
  stats: Record<string, number | string | boolean>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const headlineRows = (panel.headline ?? []).filter((r) =>
    rowIsVisible(r, stats[r.key], r.fractionKey ? stats[r.fractionKey] : undefined),
  );
  const expandedRows = (panel.expanded ?? []).filter((r) =>
    rowIsVisible(r, stats[r.key], r.fractionKey ? stats[r.fractionKey] : undefined),
  );
  if ((panel.hideIfEmpty ?? true) && headlineRows.length + expandedRows.length === 0) return null;
  return (
    <div>
      <SectionHeader
        title={panel.title}
        expanded={expanded}
        hasExpandable={expandedRows.length > 0}
        onClick={onToggle}
      />
      {headlineRows.map((r) => <StatLine key={r.key} row={r} stats={stats} />)}
      {expanded && expandedRows.map((r) => <StatLine key={r.key} row={r} stats={stats} />)}
    </div>
  );
}

const optionStyle = { background: "#0e0e11", color: "#fafafa" } as const;

const EXPAND_KEY = "pob.sidebar.expanded";
const WIDTH_KEY = "pob.sidebar.wide";

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPAND_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// Dev-only: fetches every scalar key from build.calcsTab.mainOutput and offers
// them as a downloadable text file. Used to decide which fields are worth
// surfacing in the sidebar. Guarded by import.meta.env.DEV so it never ships.
function DumpKeysButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const data = useLiveStatsStore((s) => s.data);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await invoke<{ ready: boolean; keys?: string[] }>("lua_dump_output_keys");
      if (!res.ready || !res.keys) { setMsg("No build loaded"); return; }
      const cls = (data?.class ?? "unknown").toLowerCase().replace(/\s+/g, "-");
      const asc = data?.ascendancy ? `-${data.ascendancy.toLowerCase().replace(/\s+/g, "-")}` : "";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `stat-keys-${cls}${asc}-${stamp}.txt`;
      const header = [
        `# ${data?.class ?? "?"}${data?.ascendancy ? " / " + data.ascendancy : ""} lv${data?.level ?? "?"}`,
        `# main skill: ${data?.mainSkillName ?? "?"}`,
        `# keys: ${res.keys.length}`,
        "",
      ].join("\n");
      const blob = new Blob([header + res.keys.join("\n") + "\n"], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`${res.keys.length} keys → ${filename}`);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy || !data?.ready}
        className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg disabled:opacity-50"
      >
        {busy ? "Dumping…" : "Dump stat keys"}
      </button>
      {msg && <div className="mt-1 break-words font-mono text-[10px] text-fg-muted">{msg}</div>}
    </div>
  );
}

export function Sidebar() {
  const data = useLiveStatsStore((s) => s.data);
  const defence = useLiveStatsStore((s) => s.defence);
  const headline = useLiveStatsStore((s) => s.headline);
  const error = useLiveStatsStore((s) => s.error);
  const loading = useLiveStatsStore((s) => s.loading);
  const importPhase = useLiveStatsStore((s) => s.importPhase);
  const setMainSkill = useLiveStatsStore((s) => s.setMainSkill);

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => loadExpanded());
  const [wide, setWide] = useState<boolean>(() => {
    try { return localStorage.getItem(WIDTH_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(EXPAND_KEY, JSON.stringify(expandedMap)); } catch { /* quota ignored */ }
  }, [expandedMap]);
  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, wide ? "1" : "0"); } catch { /* quota ignored */ }
  }, [wide]);

  const isExpanded = (p: PanelDef) => expandedMap[p.id] ?? p.defaultExpanded ?? false;
  const togglePanel = (id: string, currentDefault: boolean) =>
    setExpandedMap((prev) => ({ ...prev, [id]: !(prev[id] ?? currentDefault) }));

  const backgroundRecalc = loading && !importPhase;

  let body: React.ReactNode;
  if (loading && !data) {
    body = <div className="font-mono text-xs text-fg-muted">Computing…</div>;
  } else if (error) {
    body = <div className="font-mono text-xs text-life break-words">{error}</div>;
  } else if (!data) {
    body = <div className="font-mono text-xs text-fg-muted">Import a build to see computed stats.</div>;
  } else {
    const merged: Record<string, number | string | boolean> = { ...(data.stats ?? {}), ...defence };
    const leftPanels = PANELS.filter((p) => (p.column ?? "left") === "left");
    const rightPanels = PANELS.filter((p) => (p.column ?? "left") === "right");

    const renderColumn = (panels: PanelDef[]) =>
      panels.map((p) => (
        <Section
          key={p.id}
          panel={p}
          stats={merged}
          expanded={isExpanded(p)}
          onToggle={() => togglePanel(p.id, p.defaultExpanded ?? false)}
        />
      ));

    const str = typeof merged.Str === "number" ? Math.round(merged.Str) : "—";
    const dex = typeof merged.Dex === "number" ? Math.round(merged.Dex) : "—";
    const intl = typeof merged.Int === "number" ? Math.round(merged.Int) : "—";

    const vitalCell = (label: string, value: unknown, accent: string) => {
      const v = typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
      return (
        <div className="flex flex-col">
          <span className={`text-[9px] uppercase tracking-widest ${accent}`}>{label}</span>
          <span className="font-mono text-sm text-fg leading-tight">{v}</span>
        </div>
      );
    };

    const resCell = (label: string, value: unknown, over: unknown, accent: string) => {
      const v = typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "—";
      const ov = typeof over === "number" && Number.isFinite(over) && over !== 0
        ? `+${Math.round(over)}%`
        : null;
      return (
        <div className="flex flex-col">
          <span className={`text-[9px] uppercase tracking-widest ${accent}`}>{label}</span>
          <span className="font-mono text-sm text-fg leading-tight whitespace-nowrap">
            {v}{ov && <span className="ml-0.5 text-[10px] text-fg-dim">({ov})</span>}
          </span>
        </div>
      );
    };

    // Secondary headline cell — same visual rhythm as the big Combined DPS
    // but smaller. Used for Total DPS / Total DoT DPS and the per-element max
    // hits in wide mode so the extra horizontal room surfaces useful numbers.
    // `reserveSubtext` keeps vertical rhythm with the Combined DPS cell which
    // includes a skill-name subtext line — sibling cells render an invisible
    // line of the same height so the row's baseline stays flush.
    const minorHeadline = (
      label: string,
      value: unknown,
      accent?: string,
      reserveSubtext = false,
    ) => (
      <div>
        <div className="text-[9px] uppercase tracking-widest text-fg-muted">{label}</div>
        <div className={`font-mono text-base leading-tight ${accent ?? "text-fg"}`}>{fmtInt(value)}</div>
        {reserveSubtext && (
          <div className="mt-0.5 font-mono text-[10px] text-fg-muted opacity-0 select-none" aria-hidden="true">&nbsp;</div>
        )}
      </div>
    );

    // Cell wrapper that spans a range of columns in the shared 12-col grid
    // used in wide mode. Class strings are literals so Tailwind's JIT
    // scanner picks them up (template `col-span-${n}` would be invisible to
    // it). In narrow mode the span class is dropped.
    const SPAN_CLASS: Record<1 | 2 | 3 | 4 | 6, string> = {
      1: "col-span-1",
      2: "col-span-2",
      3: "col-span-3",
      4: "col-span-4",
      6: "col-span-6",
    };
    const span = (cols: 1 | 2 | 3 | 4 | 6) =>
      wide ? `${SPAN_CLASS[cols]} min-w-0` : "min-w-0";

    const topBlock = wide ? (
      // Wide mode: single 12-column grid so every row aligns on the same x
      // gridlines. Cells span 2/3/4 cols to group cleanly: DPS row 4-4-4,
      // EHP row 2-2-2-2-2-2, vitals 3-3-3-3, attributes 4-4-4.
      <>
        <div className="grid grid-cols-12 gap-x-3 gap-y-3 relative pb-2">
          {backgroundRecalc && (
            <span
              className="absolute right-0 top-0 h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
              title="Recalculating…"
            />
          )}
          {/* 3 + 1 + 3 + 1 + 3 + 1 = 12. Three equal-width data cells with
              dedicated 1-col slots holding the = / + glyphs between them
              (and a trailing empty spacer keeping the total at 12 so the
              grid lines match the rows below). */}
          <div className={span(3)}>
            <div className="text-[9px] uppercase tracking-widest text-fg-muted">Combined DPS</div>
            <div className="font-mono text-base text-fg leading-tight">{fmtInt(headline.dps)}</div>
            {headline.skill && (
              <div className="mt-0.5 font-mono text-[10px] text-fg-muted truncate">{headline.skill}</div>
            )}
          </div>
          {/* Mirror minorHeadline's structure (invisible label line + glyph
              on a value line) so = and + land at the same vertical baseline
              as the DPS values in their neighbours. */}
          <div className={span(1) + " flex flex-col items-center"}>
            <div className="text-[9px] opacity-0 select-none" aria-hidden="true">&nbsp;</div>
            <div className="font-mono text-base leading-tight text-fg-dim select-none">=</div>
          </div>
          <div className={span(3)}>{minorHeadline("Total DPS", merged.TotalDPS, undefined, true)}</div>
          <div className={span(1) + " flex flex-col items-center"}>
            <div className="text-[9px] opacity-0 select-none" aria-hidden="true">&nbsp;</div>
            <div className="font-mono text-base leading-tight text-fg-dim select-none">+</div>
          </div>
          <div className={span(3)}>{minorHeadline("Total DoT DPS", merged.TotalDotDPS, undefined, true)}</div>
          <div className={span(1)} />

          <div className={span(2)}>
            <div className="text-[9px] uppercase tracking-widest text-fg-muted">Effective HP</div>
            <div className="font-mono text-base text-fg leading-tight">{fmtInt(defence.TotalEHP)}</div>
          </div>
          <div className={span(2)}>{minorHeadline("Phys Hit", defence.PhysicalMaximumHitTaken)}</div>
          <div className={span(2)}>{minorHeadline("Fire Hit", defence.FireMaximumHitTaken, "text-red-400")}</div>
          <div className={span(2)}>{minorHeadline("Cold Hit", defence.ColdMaximumHitTaken, "text-cyan-400")}</div>
          <div className={span(2)}>{minorHeadline("Lightning", defence.LightningMaximumHitTaken, "text-yellow-400")}</div>
          <div className={span(2)}>{minorHeadline("Chaos", defence.ChaosMaximumHitTaken, "text-purple-500")}</div>
        </div>

        <div className="grid grid-cols-12 gap-x-3 gap-y-0 border-t border-border py-2">
          <div className={span(3)}>{vitalCell("Life", merged.Life, "text-red-400")}</div>
          <div className={span(3)}>{vitalCell("ES", merged.EnergyShield, "text-cyan-400")}</div>
          <div className={span(3)}>{vitalCell("Evasion", merged.Evasion, "text-green-400")}</div>
          <div className={span(3)}>{vitalCell("Armour", merged.Armour, "text-fg-dim")}</div>
        </div>

        <div className="grid grid-cols-12 gap-x-3 gap-y-0 border-t border-border py-2">
          <div className={span(3)}>{resCell("Fire", merged.FireResistTotal, merged.FireResistOverCap, "text-red-400")}</div>
          <div className={span(3)}>{resCell("Cold", merged.ColdResistTotal, merged.ColdResistOverCap, "text-cyan-400")}</div>
          <div className={span(3)}>{resCell("Lightning", merged.LightningResistTotal, merged.LightningResistOverCap, "text-yellow-400")}</div>
          <div className={span(3)}>{resCell("Chaos", merged.ChaosResistTotal, merged.ChaosResistOverCap, "text-purple-500")}</div>
        </div>

        <div className="grid grid-cols-12 gap-x-3 gap-y-0 border-t border-border py-2">
          <div className={span(4)}>{vitalCell("Strength", str === "—" ? null : str, "text-red-400")}</div>
          <div className={span(4)}>{vitalCell("Dexterity", dex === "—" ? null : dex, "text-green-400")}</div>
          <div className={span(4)}>{vitalCell("Intelligence", intl === "—" ? null : intl, "text-blue-400")}</div>
        </div>
      </>
    ) : (
      // Narrow mode keeps the original stacked layout — no 12-col grid.
      <>
        <div className="relative pb-2">
          {backgroundRecalc && (
            <span
              className="absolute right-0 top-0 h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
              title="Recalculating…"
            />
          )}
          <div className="text-[10px] uppercase tracking-widest text-fg-muted">Combined DPS</div>
          <div className="font-mono text-2xl text-fg leading-tight">{fmtInt(headline.dps)}</div>
          {headline.skill && (
            <div className="mt-0.5 font-mono text-[10px] text-fg-muted">{headline.skill}</div>
          )}
          <div className="mt-2 text-[10px] uppercase tracking-widest text-fg-muted">Effective HP</div>
          <div className="font-mono text-xl text-fg leading-tight">{fmtInt(defence.TotalEHP)}</div>
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-border py-2">
          {vitalCell("Life", merged.Life, "text-red-400")}
          {vitalCell("ES", merged.EnergyShield, "text-cyan-400")}
          {vitalCell("Evasion", merged.Evasion, "text-green-400")}
          {vitalCell("Armour", merged.Armour, "text-fg-dim")}
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-border py-2">
          {resCell("Fire", merged.FireResistTotal, merged.FireResistOverCap, "text-red-400")}
          {resCell("Cold", merged.ColdResistTotal, merged.ColdResistOverCap, "text-cyan-400")}
          {resCell("Lightning", merged.LightningResistTotal, merged.LightningResistOverCap, "text-yellow-400")}
          {resCell("Chaos", merged.ChaosResistTotal, merged.ChaosResistOverCap, "text-purple-500")}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border py-2">
          {vitalCell("Strength", str === "—" ? null : str, "text-red-400")}
          {vitalCell("Dexterity", dex === "—" ? null : dex, "text-green-400")}
          {vitalCell("Intelligence", intl === "—" ? null : intl, "text-blue-400")}
        </div>
      </>
    );

    const mainSkillPicker = data.skills && data.skills.length > 0 && (
      <div className="mt-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted">Main Skill</div>
        <select
          className="w-full rounded-sm border border-border bg-bg-elev px-2 py-0.5 font-mono text-xs text-fg"
          value={data.mainSocketGroup ?? 1}
          onChange={(e) => void setMainSkill(Number(e.target.value))}
        >
          {data.skills.map((g) => (
            <option key={g.i} value={g.i} style={optionStyle}>{g.label}</option>
          ))}
        </select>
      </div>
    );

    body = wide ? (
      <>
        {topBlock}
        {mainSkillPicker}
        <div className="mt-2 grid grid-cols-2 gap-x-5">
          <div>{renderColumn(leftPanels)}</div>
          <div>{renderColumn(rightPanels)}</div>
        </div>
      </>
    ) : (
      <>
        {topBlock}
        {mainSkillPicker}
        <div className="mt-2">{renderColumn([...leftPanels, ...rightPanels])}</div>
      </>
    );
  }

  return (
    <aside
      className={`${wide ? "w-[40rem]" : "w-80"} shrink-0 min-h-0 h-full overflow-y-auto border-r border-border bg-bg p-3 transition-[width] duration-150`}
    >
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setWide((w) => !w)}
          className="rounded-sm border border-border bg-bg-elev px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
          title={wide ? "Narrow sidebar" : "Widen sidebar to 2 columns"}
        >
          {wide ? "« 1 col" : "2 col »"}
        </button>
      </div>
      {body}
      {import.meta.env.DEV && <DumpKeysButton className="mt-4" />}
    </aside>
  );
}
