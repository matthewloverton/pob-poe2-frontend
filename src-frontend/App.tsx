import manifest from "./data/manifest.json";
import treeData from "./data/tree.json";
import type { PassiveTree } from "./types/tree";
import { StatusPill } from "./ui/StatusPill";
import { TreeCanvas } from "./tree/TreeCanvas";
import { Toolbar } from "./ui/Toolbar";
import { Sidebar } from "./ui/Sidebar";
import { DialogHost } from "./ui/DialogHost";

const tree = treeData as unknown as PassiveTree;

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="font-mono text-xs text-fg-dim">
          PoB-PoE2 v{manifest.appVersion} · tree {manifest.treeVersion}
        </div>
        <StatusPill />
      </header>
      <Toolbar />
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
