import { Panel } from "./Panel";
import { useBuildStore } from "../build/buildStore";

const CLASS_NAMES: Record<number, string> = {
  0: "None", 1: "Witch", 2: "Ranger", 3: "Warrior", 4: "Mercenary", 5: "Monk", 6: "Sorceress",
};

export function Sidebar() {
  const classId = useBuildStore((s) => s.classId);
  const allocatedCount = useBuildStore((s) => s.allocated.size);

  return (
    <aside className="w-72 border-r border-border bg-bg p-3 space-y-3">
      <Panel title="Build">
        <dl className="grid grid-cols-2 gap-y-1 font-mono text-xs">
          <dt className="text-fg-muted">Class</dt>
          <dd className="text-fg">{CLASS_NAMES[classId] ?? `#${classId}`}</dd>
          <dt className="text-fg-muted">Allocated</dt>
          <dd className="text-fg">{allocatedCount}</dd>
        </dl>
      </Panel>
    </aside>
  );
}
