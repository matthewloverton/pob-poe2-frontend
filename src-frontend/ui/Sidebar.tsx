import { Panel } from "./Panel";
import { countUserAllocated, useBuildStore } from "../build/buildStore";
import { CLASS_NAMES } from "../build/classStarts";

export function Sidebar() {
  const classId = useBuildStore((s) => s.classId);
  const setClass = useBuildStore((s) => s.setClass);
  const userCount = useBuildStore(countUserAllocated);
  const canChangeClass = userCount === 0;

  return (
    <aside className="w-72 border-r border-border bg-bg p-3 space-y-3">
      <Panel title="Build">
        <dl className="grid grid-cols-[5.5rem_1fr] gap-y-2 items-center font-mono text-xs">
          <dt className="text-fg-muted">Class</dt>
          <dd>
            <select
              className="w-full rounded-sm border border-border bg-bg-elev px-2 py-1 text-fg disabled:cursor-not-allowed disabled:text-fg-muted"
              value={classId}
              onChange={(e) => setClass(Number(e.target.value))}
              disabled={!canChangeClass}
              title={canChangeClass ? "Choose a class" : "Deallocate all nodes to change class"}
            >
              {Object.entries(CLASS_NAMES).map(([id, name]) => (
                <option key={id} value={id} style={{ background: "#0e0e11", color: "#fafafa" }}>
                  {name}
                </option>
              ))}
            </select>
          </dd>
          <dt className="text-fg-muted">Allocated</dt>
          <dd className="text-fg">{userCount}</dd>
        </dl>
      </Panel>
    </aside>
  );
}
