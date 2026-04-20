import type { NodeId, PassiveNode } from "../types/tree";
import { buildGraph, findOrphansOnRemove, shortestPath, type Graph } from "../build/pathing";

export class TreeInteraction {
  private graph: Graph;
  private nodes: Record<string, PassiveNode>;

  constructor(nodes: Record<string, PassiveNode>) {
    this.nodes = nodes;
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

  // When hovering/clicking an allocated node to deallocate it, also find every
  // node that would become detached from the class-start anchor.
  orphansOnRemove(allocated: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
    return findOrphansOnRemove(allocated, nodeId, this.graph, this.nodes);
  }
}
