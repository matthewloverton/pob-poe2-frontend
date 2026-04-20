import manifest from "./data/manifest.json";

export default function App() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-fg-muted font-mono text-xs">
        PoB-PoE2 v{manifest.appVersion} · tree {manifest.treeVersion}
      </div>
    </div>
  );
}
