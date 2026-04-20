import type { NodeId, PassiveNode } from "../types/tree";
import { buildGraph, shortestPath, type Graph } from "../build/pathing";

export class TreeInteraction {
  private graph: Graph;

  constructor(nodes: Record<string, PassiveNode>) {
    this.graph = buildGraph(nodes);
  }

  computePathing(allocated: Set<NodeId>, hovered: NodeId | null): Set<NodeId> {
    if (hovered == null || allocated.has(hovered)) return new Set();
    const path = shortestPath(allocated, hovered, this.graph);
    return new Set(path ?? []);
  }

  nodesToAllocate(allocated: Set<NodeId>, target: NodeId): NodeId[] {
    return shortestPath(allocated, target, this.graph) ?? [];
  }
}
