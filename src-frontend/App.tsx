import { useEffect } from "react";
import manifest from "./data/manifest.json";
import treeData from "./data/tree.json";
import type { PassiveTree } from "./types/tree";
import { StatusPill } from "./ui/StatusPill";
import { TreeCanvas } from "./tree/TreeCanvas";
import { Toolbar } from "./ui/Toolbar";
import { BuildMeta } from "./ui/BuildMeta";
import { Sidebar } from "./ui/Sidebar";
import { DialogHost } from "./ui/DialogHost";
import { BuildLoader } from "./ui/BuildLoader";
import { useBuildStore } from "./build/buildStore";
import { useLiveStatsStore } from "./build/liveStatsStore";

const tree = treeData as unknown as PassiveTree;

export default function App() {
  const sourceXml = useBuildStore((s) => s.sourceXml);
  const allocated = useBuildStore((s) => s.allocated);
  const refresh = useLiveStatsStore((s) => s.refresh);
  const setAllocated = useLiveStatsStore((s) => s.setAllocated);

  useEffect(() => {
    void refresh(sourceXml);
  }, [sourceXml, refresh]);

  // Push allocation deltas to the sidecar after a short debounce. Skipped until
  // the initial refresh has populated live stats — otherwise the set_allocated
  // call races ahead of the first build load.
  useEffect(() => {
    if (!useLiveStatsStore.getState().data) return;
    const t = setTimeout(() => {
      if (!useLiveStatsStore.getState().data) return;
      void setAllocated([...allocated]);
    }, 250);
    return () => clearTimeout(t);
  }, [allocated, setAllocated]);

  return (
    <div className="h-full flex flex-col relative">
      <BuildLoader />
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="font-mono text-xs text-fg-dim">
          PoB-PoE2 v{manifest.appVersion} · tree {manifest.treeVersion}
        </div>
        <StatusPill />
      </header>
      <Toolbar />
      <BuildMeta />
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 relative">
          <TreeCanvas tree={tree} />
        </main>
      </div>
      <DialogHost />
    </div>
  );
}
