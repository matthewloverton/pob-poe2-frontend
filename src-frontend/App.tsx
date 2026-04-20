import manifest from "./data/manifest.json";
import { StatusPill } from "./ui/StatusPill";

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="font-mono text-xs text-fg-dim">
          PoB-PoE2 v{manifest.appVersion} · tree {manifest.treeVersion}
        </div>
        <StatusPill />
      </header>
      <main className="flex-1 flex items-center justify-center text-fg-muted font-mono text-xs">
        tree canvas goes here
      </main>
    </div>
  );
}
