import { useEffect, useRef } from "react";
import { TreeRenderer } from "./TreeRenderer";
import type { PassiveTree } from "../types/tree";

export function TreeCanvas({ tree }: { tree: PassiveTree }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new TreeRenderer(tree);
    rendererRef.current = renderer;
    renderer.init(canvas);
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, [tree]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
