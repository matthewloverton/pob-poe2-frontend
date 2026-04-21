import { useBuildStore } from "../build/buildStore";
import { ascendanciesFor, CLASS_NAMES } from "../build/classStarts";
import { useLiveStatsStore } from "../build/liveStatsStore";
import { computePoints } from "../build/pointCounts";

const optionStyle = { background: "#0e0e11", color: "#fafafa" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="uppercase tracking-widest">{label}</span>
      {children}
    </label>
  );
}

const SELECT_CLASSES =
  "rounded-sm border border-border bg-bg-elev px-2 py-0.5 text-fg disabled:cursor-not-allowed disabled:text-fg-muted";

export function BuildMeta() {
  const classId = useBuildStore((s) => s.classId);
  const setClass = useBuildStore((s) => s.setClass);
  const ascendancyId = useBuildStore((s) => s.ascendancyId);
  const setAscendancy = useBuildStore((s) => s.setAscendancy);
  const allocated = useBuildStore((s) => s.allocated);
  const nodeModes = useBuildStore((s) => s.nodeModes);
  const classStartId = useBuildStore((s) => s.classStartId);
  const ascendStartId = useBuildStore((s) => s.ascendStartId);
  const level = useLiveStatsStore((s) => s.data?.level);
  const points = computePoints({ allocated, nodeModes, classStartId, ascendStartId, level });
  const canChangeClass = points.main === 0 && points.ws1 === 0 && points.ws2 === 0 && points.ascend === 0;
  const ascendancies = ascendanciesFor(classId);

  return (
    <div className="flex items-center gap-4 border-b border-border bg-bg px-4 py-1.5 font-mono text-xs text-fg-muted">
      <Field label="Class">
        <select
          className={SELECT_CLASSES}
          value={classId}
          onChange={(e) => setClass(Number(e.target.value))}
          disabled={!canChangeClass}
          title={canChangeClass ? "Choose a class" : "Deallocate all nodes to change class"}
        >
          {Object.entries(CLASS_NAMES).map(([id, name]) => (
            <option key={id} value={id} style={optionStyle}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <Divider />

      <Field label="Ascendancy">
        <select
          className={SELECT_CLASSES}
          value={ascendancyId}
          onChange={(e) => setAscendancy(Number(e.target.value))}
          disabled={ascendancies.length === 0}
        >
          <option value={0} style={optionStyle}>None</option>
          {ascendancies.map((name, i) => (
            <option key={name} value={i + 1} style={optionStyle}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <Divider />

      <Field label="Level">
        <span className="text-fg">{level ?? "—"}</span>
      </Field>

      <Divider />

      <PointsPill />
    </div>
  );
}

function PointsPill() {
  const level = useLiveStatsStore((s) => s.data?.level);
  const allocMode = useBuildStore((s) => s.allocMode);
  const setAllocMode = useBuildStore((s) => s.setAllocMode);
  const allocated = useBuildStore((s) => s.allocated);
  const nodeModes = useBuildStore((s) => s.nodeModes);
  const classStartId = useBuildStore((s) => s.classStartId);
  const ascendStartId = useBuildStore((s) => s.ascendStartId);
  const p = computePoints({ allocated, nodeModes, classStartId, ascendStartId, level });

  const pill = (
    label: React.ReactNode,
    isActive: boolean,
    onClick: () => void,
    title: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-sm px-1.5 py-0.5 transition-colors ${
        isActive ? "bg-bg-elev ring-1 ring-fg" : "hover:bg-bg-elev"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      <span className="uppercase tracking-widest pr-1">Points</span>
      {pill(
        <span className="text-fg">{p.main} / {p.maxMain}</span>,
        allocMode === 0,
        () => setAllocMode(0),
        "Main tree mode",
      )}
      <Divider />
      {pill(
        <span className="text-red-400">{p.ws1} / {p.maxWs1}</span>,
        allocMode === 1,
        () => setAllocMode(allocMode === 1 ? 0 : 1),
        "Weapon set 1 — click to toggle, new nodes go into this bank",
      )}
      {pill(
        <span className="text-green-400">{p.ws2} / {p.maxWs2}</span>,
        allocMode === 2,
        () => setAllocMode(allocMode === 2 ? 0 : 2),
        "Weapon set 2 — click to toggle, new nodes go into this bank",
      )}
      <Divider />
      <span className="text-fg px-1.5">{p.ascend} / {p.maxAscend}</span>
    </div>
  );
}

function Divider() {
  return <span className="h-3 w-px bg-border" aria-hidden />;
}

