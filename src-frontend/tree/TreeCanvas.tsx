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
    renderer.onNodeClick = (id) => {
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
      if (path.length === 0) {
        import("../ui/dialogStore").then(({ useDialogStore }) => {
          useDialogStore.getState().pushToast(`No path to node ${id} from your allocation.`, "error");
        });
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
        import("../ui/dialogStore").then(({ useDialogStore }) => {
          useDialogStore.getState().pushToast(check.reason, "error");
        });
        return;
      }
      allocate(path);
    };
    renderer.init(canvas).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      interactionRef.current = interaction;
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
  }, [classStartId, classId, ascendStartId, ascendancyId]);

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
      {!loading && hoveredNode && cursor && <NodeTooltip node={hoveredNode} x={cursor.x} y={cursor.y} />}
    </div>
  );
}
