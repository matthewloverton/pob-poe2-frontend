import { useLiveStatsStore } from "../build/liveStatsStore";

// Shown for every import — transitions from "Importing Build" → "Calculating
// Stats" as the sidecar works through its phases. In-app allocation/skill
// recalcs don't set importPhase, so they update silently without overlay flicker.
export function BuildLoader() {
  const phase = useLiveStatsStore((s) => s.importPhase);
  if (!phase) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 backdrop-blur-sm">
      <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">
        {phase}
      </div>
      <div className="h-1 w-64 overflow-hidden rounded-full bg-zinc-800">
        <div className="indeterminate-bar h-full rounded-full bg-zinc-300" />
      </div>
    </div>
  );
}
