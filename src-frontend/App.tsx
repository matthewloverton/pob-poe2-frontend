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
import { ItemsPanel } from "./items/ItemsPanel";
import { ConfigPanel } from "./config/ConfigPanel";
import { useConfigStore } from "./config/configStore";
import { useBuildStore } from "./build/buildStore";
import { useLiveStatsStore } from "./build/liveStatsStore";
import { useItemsStore } from "./items/itemsStore";
import { useTabStore, type AppTab } from "./ui/tabStore";

const tree = treeData as unknown as PassiveTree;

export default function App() {
  const sourceXml = useBuildStore((s) => s.sourceXml);
  const allocated = useBuildStore((s) => s.allocated);
  const nodeOverrides = useBuildStore((s) => s.nodeOverrides);
  const refresh = useLiveStatsStore((s) => s.refresh);
  const setAllocated = useLiveStatsStore((s) => s.setAllocated);
  const loadItemsXml = useItemsStore((s) => s.loadXml);
  const loadBasesAndIcons = useItemsStore((s) => s.loadBasesAndIcons);
  const refreshJewelSockets = useItemsStore((s) => s.refreshJewelSockets);
  const loadConfigXml = useConfigStore((s) => s.loadXml);
  const loadConfigSchema = useConfigStore((s) => s.loadSchema);
  const tab = useTabStore((s) => s.tab);
  const setTab = useTabStore((s) => s.setTab);

  useEffect(() => {
    // Kick off the sidecar refresh and local items parse in parallel.
    // Jewel-socket info (radii, affected nodes) only becomes available
    // AFTER PoB has finished computing, so we chain it off refresh.
    loadItemsXml(sourceXml);
    loadConfigXml(sourceXml);
    void (async () => {
      await refresh(sourceXml);
      await refreshJewelSockets();
    })();
  }, [sourceXml, refresh, loadItemsXml, refreshJewelSockets, loadConfigXml]);

  useEffect(() => {
    void loadBasesAndIcons();
  }, [loadBasesAndIcons]);

  useEffect(() => { loadConfigSchema(); }, [loadConfigSchema]);

  // Push allocation deltas to the sidecar after a short debounce. Skipped until
  // the initial refresh has populated live stats — otherwise the set_allocated
  // call races ahead of the first build load.
  useEffect(() => {
    if (!useLiveStatsStore.getState().data) return;
    const t = setTimeout(() => {
      if (!useLiveStatsStore.getState().data) return;
      void (async () => {
        await setAllocated([...allocated], nodeOverrides);
        await refreshJewelSockets();
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [allocated, nodeOverrides, setAllocated, refreshJewelSockets]);

  return (
    <div className="h-full flex flex-col relative">
      <BuildLoader />
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="font-mono text-xs text-fg-dim">
            PoB-PoE2 v{manifest.appVersion} · tree {manifest.treeVersion}
          </div>
          <TabSwitcher tab={tab} setTab={setTab} />
        </div>
        <StatusPill />
      </header>
      <Toolbar />
      <BuildMeta />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 relative min-w-0">
          <div className="absolute inset-0" style={{ display: tab === "tree" ? "block" : "none" }}>
            <TreeCanvas tree={tree} />
          </div>
          <div className="absolute inset-0 overflow-hidden" style={{ display: tab === "items" ? "block" : "none" }}>
            <ItemsPanel />
          </div>
          <div className="absolute inset-0 overflow-hidden" style={{ display: tab === "config" ? "block" : "none" }}>
            <ConfigPanel />
          </div>
        </main>
      </div>
      <DialogHost />
    </div>
  );
}

function TabSwitcher({ tab, setTab }: { tab: AppTab; setTab: (t: AppTab) => void }) {
  const tabs: Array<{ id: AppTab; label: string }> = [
    { id: "tree", label: "Tree" },
    { id: "items", label: "Items" },
    { id: "config", label: "Config" },
  ];
  return (
    <div className="flex items-center gap-1 font-mono text-[11px]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`rounded-sm px-2 py-0.5 uppercase tracking-widest transition-colors ${
            tab === t.id
              ? "bg-bg-elev text-fg ring-1 ring-border"
              : "text-fg-muted hover:text-fg hover:bg-bg-elev"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
