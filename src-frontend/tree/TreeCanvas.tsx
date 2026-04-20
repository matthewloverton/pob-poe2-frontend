import { useEffect, useRef, useState } from "react";
import { TreeRenderer } from "./TreeRenderer";
import { TreeInteraction } from "./TreeInteraction";
import type { PassiveTree, NodeId } from "../types/tree";
import { useBuildStore } from "../build/buildStore";

export function TreeCanvas({ tree }: { tree: PassiveTree }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);
  const interactionRef = useRef<TreeInteraction | null>(null);
  const [hovered, setHovered] = useState<NodeId | null>(null);

  const allocated = useBuildStore((s) => s.allocated);
  const allocate = useBuildStore((s) => s.allocate);
  const deallocate = useBuildStore((s) => s.deallocate);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new TreeRenderer(tree);
    const interaction = new TreeInteraction(tree.nodes);
    rendererRef.current = renderer;
    interactionRef.current = interaction;
    renderer.onNodeHover = setHovered;
    renderer.onNodeClick = (id) => {
      const i = interactionRef.current;
      if (!i) return;
      const s = useBuildStore.getState();
      if (s.allocated.has(id)) {
        deallocate(id);
      } else {
        const path = i.nodesToAllocate(s.allocated, id);
        if (path.length > 0) allocate(path);
      }
    };
    renderer.init(canvas);
    return () => { renderer.destroy(); rendererRef.current = null; interactionRef.current = null; };
  }, [tree, allocate, deallocate]);

  useEffect(() => {
    const r = rendererRef.current;
    const i = interactionRef.current;
    if (!r || !i) return;
    const pathing = i.computePathing(allocated, hovered);
    r.applyAllocations(allocated, pathing, hovered);
  }, [allocated, hovered]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
