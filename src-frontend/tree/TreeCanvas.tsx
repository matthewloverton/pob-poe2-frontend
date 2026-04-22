import { useEffect, useRef, useState } from "react";
import { TreeRenderer } from "./TreeRenderer";
import { TreeInteraction } from "./TreeInteraction";
import type { PassiveTree, NodeId } from "../types/tree";
import { useBuildStore } from "../build/buildStore";
import { ascendanciesFor } from "../build/classStarts";
import { checkAllocation, computePoints } from "../build/pointCounts";
import { NodeTooltip } from "../ui/NodeTooltip";
import { useFocusStore } from "./focusStore";

export function TreeCanvas({ tree }: { tree: PassiveTree }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);
  const interactionRef = useRef<TreeInteraction | null>(null);
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState<{ pct: number; label: string } | null>({
    pct: 0,
    label: "Preparing tree",
  });

  const allocated = useBuildStore((s) => s.allocated);
  const classStartId = useBuildStore((s) => s.classStartId);
  const classId = useBuildStore((s) => s.classId);
  const ascendStartId = useBuildStore((s) => s.ascendStartId);
  const ascendancyId = useBuildStore((s) => s.ascendancyId);
  const nodeOverrides = useBuildStore((s) => s.nodeOverrides);
  const allocMode = useBuildStore((s) => s.allocMode);
  const nodeModes = useBuildStore((s) => s.nodeModes);
  const allocate = useBuildStore((s) => s.allocate);
  const deallocate = useBuildStore((s) => s.deallocate);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const renderer = new TreeRenderer(tree);
    const interaction = new TreeInteraction(tree.nodes);
    const s0 = useBuildStore.getState();
    const ascName0 = s0.ascendancyId > 0 ? ascendanciesFor(s0.classId)[s0.ascendancyId - 1] ?? null : null;
    interaction.setActiveAnchors({
      classStartId: s0.classStartId,
      ascendStartId: s0.ascendStartId,
      ascendancyName: ascName0,
    });
    renderer.onNodeHover = setHovered;
    renderer.onProgress = (pct, label) => {
      if (!cancelled) setLoading({ pct, label });
    };
    renderer.onReady = () => {
      if (!cancelled) setLoading(null);
    };
    renderer.onNodeClick = async (id) => {
      const i = interactionRef.current;
      if (!i) return;
      const s = useBuildStore.getState();
      if (s.allocated.has(id)) {
        const orphans = i.orphansOnRemove(s.allocated, id);
        deallocate(id);
        for (const orphanId of orphans) deallocate(orphanId);
        return;
      }
      const path = i.nodesToAllocate(s.allocated, id);
      const { useDialogStore } = await import("../ui/dialogStore");
      if (path.length === 0) {
        useDialogStore.getState().pushToast(`No path to node ${id} from your allocation.`, "error");
        return;
      }
      const current = computePoints({
        allocated: s.allocated,
        nodeModes: s.nodeModes,
        classStartId: s.classStartId,
        ascendStartId: s.ascendStartId,
      });
      const check = checkAllocation(current, path, s.allocMode);
      if (!check.ok) {
        useDialogStore.getState().pushToast(check.reason, "error");
        return;
      }
      // Any multi-option nodes newly in the path need a choice before we
      // commit. All the attribute nodes share the same 3 options (Str/Dex/Int)
      // so we collect them into ONE prompt and apply the user's pick to every
      // matching node in the path — avoiding a dialog-per-node mash.
      const needsChoice: number[] = [];
      for (const nid of path) {
        const n = tree.nodes[String(nid)];
        if (n?.options && n.options.length > 0 && s.nodeOverrides[nid] === undefined) {
          needsChoice.push(nid);
        }
      }
      const picks: Record<number, number> = {};
      if (needsChoice.length > 0) {
        // Use the first node's options as the canonical choice set. In practice
        // every "+5 to any Attribute" uses the same Str/Dex/Int trio so they
        // share a choice; if a path ever contained heterogeneous multi-option
        // nodes (none exist today), this fallback would still apply the same
        // index and the frontend would silently pick option[idx] on each.
        const first = tree.nodes[String(needsChoice[0])]!;
        const options = (first.options ?? []).map((o) => ({
          label: o.name,
          description: Array.isArray(o.stats) ? o.stats.join(" · ") : undefined,
        }));
        const title = needsChoice.length === 1
          ? (first.name ? `${first.name}: Choose Option` : "Choose Option")
          : `Choose Option (applies to ${needsChoice.length} nodes)`;
        const chosen = await useDialogStore.getState().openChoice(title, options);
        if (chosen == null) return; // cancelled — abort the whole allocation
        for (const nid of needsChoice) picks[nid] = chosen;
      }
      const setOverride = useBuildStore.getState().setNodeOverride;
      for (const [nidStr, idx] of Object.entries(picks)) setOverride(Number(nidStr), idx);
      allocate(path);
    };
    renderer.init(canvas).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      interactionRef.current = interaction;
      // Apply any existing overrides (from a build import that resolved before
      // init) now that atlas textures are available.
      renderer.applyOverrideIcons(useBuildStore.getState().nodeOverrides);
      // Initial class/ascendancy background pass — effect-driven updates kick
      // in afterwards but we need this first draw once textures are loaded.
      const s0b = useBuildStore.getState();
      void renderer.applyBackgrounds({
        classId: s0b.classId,
        ascendancyId: s0b.ascendancyId,
        classStartId: s0b.classStartId,
      });
    }).catch((err) => {
      console.error("TreeRenderer init failed", err);
    });
    return () => {
      cancelled = true;
      if (rendererRef.current === renderer) {
        renderer.destroy();
        rendererRef.current = null;
        interactionRef.current = null;
      }
    };
  }, [tree, allocate, deallocate]);

  useEffect(() => {
    const i = interactionRef.current;
    if (!i) return;
    const ascName = ascendancyId > 0 ? ascendanciesFor(classId)[ascendancyId - 1] ?? null : null;
    i.setActiveAnchors({ classStartId, ascendStartId, ascendancyName: ascName });
    const r = rendererRef.current;
    if (r) {
      void r.applyBackgrounds({ classId, ascendancyId, classStartId });
    }
  }, [classStartId, classId, ascendStartId, ascendancyId, tree]);

  // Swap icon textures for overridden multi-option nodes (attribute picks).
  // Fires after init + whenever the user's selections change. No-op before the
  // renderer has finished loading atlases.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.applyOverrideIcons(nodeOverrides);
  }, [nodeOverrides]);

  useEffect(() => {
    const r = rendererRef.current;
    const i = interactionRef.current;
    if (!r || !i) return;
    const pathing = i.computePathing(allocated, hovered);
    const pathingEdges = i.pathingEdges(allocated, hovered);
    let removing: Set<NodeId> = new Set();
    if (hovered != null && allocated.has(hovered)) {
      removing = i.orphansOnRemove(allocated, hovered);
      removing.add(hovered);
    }
    r.applyAllocations(allocated, pathing, hovered, removing, pathingEdges, allocMode, nodeModes);
  }, [allocated, hovered, allocMode, nodeModes]);

  const pendingFocus = useFocusStore((s) => s.pendingFocus);
  const clearFocus = useFocusStore((s) => s.clear);
  useEffect(() => {
    if (pendingFocus == null) return;
    const r = rendererRef.current;
    if (!r) return;
    r.focusNode(pendingFocus);
    clearFocus();
  }, [pendingFocus, clearFocus]);

  const hoveredNode = hovered != null ? tree.nodes[String(hovered)] : null;

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onPointerMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      onPointerLeave={() => setCursor(null)}
    >
      <canvas ref={canvasRef} className={`block h-full w-full ${loading ? "invisible" : ""}`} />
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
          <div className="font-mono text-xs uppercase tracking-widest text-zinc-500">{loading.label}</div>
          <div className="h-1 w-64 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-zinc-300 transition-[width] duration-100 ease-out"
              style={{ width: `${Math.max(4, Math.round(loading.pct * 100))}%` }}
            />
          </div>
        </div>
      )}
      {!loading && hoveredNode && cursor && (
        <NodeTooltip
          node={hoveredNode}
          x={cursor.x}
          y={cursor.y}
          overrideIndex={hovered != null ? nodeOverrides[hovered] : undefined}
        />
      )}
    </div>
  );
}
