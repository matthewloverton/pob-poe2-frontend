import { Panel } from "./Panel";
import { useLiveStatsStore } from "../build/liveStatsStore";

function fmtInt(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function fmtDec(n: unknown, digits = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtRes(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

function Attr({ label, value, color }: { label: string; value: unknown; color: string }) {
  const v = typeof value === "number" ? Math.round(value) : "—";
  return (
    <span className="flex items-baseline gap-1">
      <span className={`uppercase tracking-widest ${color}`}>{label}</span>
      <span className="text-fg">{v}</span>
    </span>
  );
}

function Headline({ label, value, skill }: { label: string; value: React.ReactNode; skill?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-fg-muted">{label}</div>
      <div className="font-mono text-2xl text-fg leading-tight">{value}</div>
      {skill && <div className="mt-0.5 font-mono text-[10px] text-fg-muted">{skill}</div>}
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-fg-muted uppercase tracking-widest text-[10px]">{label}</span>
      <span className={`font-mono text-xs ${accent ?? "text-fg"}`}>{value}</span>
    </div>
  );
}

const optionStyle = { background: "#0e0e11", color: "#fafafa" } as const;

export function Sidebar() {
  const data = useLiveStatsStore((s) => s.data);
  const defence = useLiveStatsStore((s) => s.defence);
  const headline = useLiveStatsStore((s) => s.headline);
  const error = useLiveStatsStore((s) => s.error);
  const loading = useLiveStatsStore((s) => s.loading);
  const importPhase = useLiveStatsStore((s) => s.importPhase);
  const setMainSkill = useLiveStatsStore((s) => s.setMainSkill);
  // Background recalc: sidecar is computing but this isn't an explicit import
  // (no overlay). A small pulsing dot keeps the user aware that stats are
  // about to shift without drawing too much attention.
  const backgroundRecalc = loading && !importPhase;

  let body: React.ReactNode;
  if (loading && !data) {
    body = <div className="font-mono text-xs text-fg-muted">Computing…</div>;
  } else if (error) {
    body = <div className="font-mono text-xs text-life break-words">{error}</div>;
  } else if (!data) {
    body = (
      <div className="font-mono text-xs text-fg-muted">
        Import a build to see computed stats.
      </div>
    );
  } else {
    const s = data.stats ?? {};
    body = (
      <div className="space-y-3">
        <div className="relative space-y-2 rounded-sm border border-border bg-bg-elev p-3">
          {backgroundRecalc && (
            <span
              className="absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
              title="Recalculating…"
            />
          )}
          <Headline
            label="Combined DPS"
            value={fmtInt(headline.dps)}
            skill={headline.skill}
          />
          <Headline label="Effective HP" value={fmtInt(defence.TotalEHP)} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-bg-elev px-3 py-2 font-mono text-xs">
          <Attr label="Str" value={s.Str} color="text-red-400" />
          <Attr label="Dex" value={s.Dex} color="text-green-400" />
          <Attr label="Int" value={s.Int} color="text-blue-400" />
        </div>

        <Panel title="Offence">
          {data.skills && data.skills.length > 0 && (
            <div className="pb-1.5">
              <select
                className="w-full rounded-sm border border-border bg-bg-elev px-2 py-0.5 font-mono text-xs text-fg"
                value={data.mainSocketGroup ?? 1}
                onChange={(e) => void setMainSkill(Number(e.target.value))}
                title="Main skill for damage calculations"
              >
                {data.skills.map((g) => (
                  <option key={g.i} value={g.i} style={optionStyle}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <StatRow label="Total DPS" value={fmtInt(s.TotalDPS)} />
          <StatRow label="Combined DPS" value={fmtInt(s.CombinedDPS)} />
          {typeof s.FullDPS === "number" && s.FullDPS > 0 && (
            <StatRow label="Full DPS" value={fmtInt(s.FullDPS)} />
          )}
          <StatRow label="Avg Damage" value={fmtDec(s.AverageDamage)} />
        </Panel>

        <Panel title="Defence">
          <StatRow label="Life" value={fmtInt(s.Life)} accent="text-red-400" />
          <StatRow label="Energy Shield" value={fmtInt(s.EnergyShield)} accent="text-cyan-400" />
          <StatRow label="Mana" value={fmtInt(s.Mana)} accent="text-blue-400" />
          {typeof s.Spirit === "number" && s.Spirit > 0 && (
            <StatRow label="Spirit" value={fmtInt(s.Spirit)} accent="text-yellow-400" />
          )}
          <StatRow label="Armour" value={fmtInt(s.Armour)} />
          <StatRow label="Evasion" value={fmtInt(s.Evasion)} accent="text-green-400" />
          {typeof s.Ward === "number" && s.Ward > 0 && (
            <StatRow label="Ward" value={fmtInt(s.Ward)} />
          )}
        </Panel>

        <Panel title="Max Hit Taken">
          <StatRow label="Physical" value={fmtInt(defence.PhysicalMaximumHitTaken)} />
          <StatRow label="Fire" value={fmtInt(defence.FireMaximumHitTaken)} accent="text-red-400" />
          <StatRow label="Cold" value={fmtInt(defence.ColdMaximumHitTaken)} accent="text-cyan-400" />
          <StatRow label="Lightning" value={fmtInt(defence.LightningMaximumHitTaken)} accent="text-yellow-400" />
          <StatRow label="Chaos" value={fmtInt(defence.ChaosMaximumHitTaken)} accent="text-purple-500" />
        </Panel>

        <Panel title="Resistances">
          <StatRow label="Fire" value={fmtRes(s.FireResist)} accent="text-red-400" />
          <StatRow label="Cold" value={fmtRes(s.ColdResist)} accent="text-cyan-400" />
          <StatRow label="Lightning" value={fmtRes(s.LightningResist)} accent="text-yellow-400" />
          <StatRow label="Chaos" value={fmtRes(s.ChaosResist)} accent="text-purple-500" />
        </Panel>
      </div>
    );
  }

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-border bg-bg p-3">
      {body}
    </aside>
  );
}
