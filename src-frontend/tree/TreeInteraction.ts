import type { NodeId, PassiveNode } from "../types/tree";
import { buildGraph, findOrphansOnRemove, type Graph } from "../build/pathing";

export class TreeInteraction {
  private graph: Graph;
  private nodes: Record<string, PassiveNode>;
  private allClassStarts: Set<NodeId>;
  // Permanently off-limits: ascendancy nodes. Class starts connect to every
  // ascendancy-root of their class (Ranger → Deadeye, Pathfinder, Amazon,
  // Ritualist), and those sit tens of thousands of units away in their own
  // sub-trees. Without excluding them, BFS happily threads through an ascendancy
  // and emerges somewhere unrelated, so the visible path looks like it starts
  // in a different part of the tree.
  private ascendancyNodes: Set<NodeId>;
  private forbidden: Set<NodeId> = new Set();
  private activeClassStartId: NodeId | null = null;

  constructor(nodes: Record<string, PassiveNode>) {
    this.nodes = nodes;
    this.graph = buildGraph(nodes);
    this.allClassStarts = new Set();
    this.ascendancyNodes = new Set();
    for (const [idStr, node] of Object.entries(nodes)) {
      const id = Number(idStr);
      if (Array.isArray(node.classesStart)) this.allClassStarts.add(id);
      if (node.ascendancyName != null) this.ascendancyNodes.add(id);
    }
  }

  setActiveClassStart(startId: NodeId | null) {
    this.activeClassStartId = startId;
    this.forbidden = new Set(this.ascendancyNodes);
    for (const sid of this.allClassStarts) this.forbidden.add(sid);
    if (startId != null) this.forbidden.delete(startId);
  }

  // BFS from the class anchor to `target`. Returns the full parent chain so the
  // caller can derive both the ordered node list and the ordered edge list and
  // be sure the visible path always emerges from the class start.
  private bfsFromAnchor(target: NodeId): Map<NodeId, NodeId> | null {
    if (this.activeClassStartId == null) return null;
    if (target === this.activeClassStartId) return new Map();
    if (this.forbidden.has(target)) return null;

    const start = this.activeClassStartId;
    const visited = new Set<NodeId>([start]);
    const parent = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of this.graph.get(current) ?? []) {
        if (visited.has(next)) continue;
        if (this.forbidden.has(next)) continue;
        visited.add(next);
        parent.set(next, current);
        if (next === target) return parent;
        queue.push(next);
      }
    }
    return null;
  }

  private reconstructPath(parent: Map<NodeId, NodeId>, target: NodeId): NodeId[] {
    const path: NodeId[] = [];
    let n: NodeId = target;
    while (parent.has(n)) {
      path.unshift(n);
      n = parent.get(n)!;
    }
    return path;
  }

  // Nodes to highlight as "path preview" — the full route from the class anchor
  // to the hovered node, excluding the anchor itself. Nodes already allocated
  // keep their allocated state because applyAllocations prioritises it.
  computePathing(allocated: Set<NodeId>, hovered: NodeId | null): Set<NodeId> {
    if (hovered == null) return new Set();
    if (allocated.has(hovered)) return new Set();
    const parent = this.bfsFromAnchor(hovered);
    if (!parent) return new Set();
    return new Set(this.reconstructPath(parent, hovered));
  }

  pathingEdges(allocated: Set<NodeId>, hovered: NodeId | null): Array<[NodeId, NodeId]> {
    if (hovered == null) return [];
    if (allocated.has(hovered)) return [];
    const parent = this.bfsFromAnchor(hovered);
    if (!parent) return [];
    const edges: Array<[NodeId, NodeId]> = [];
    let n: NodeId = hovered;
    while (parent.has(n)) {
      const p = parent.get(n)!;
      edges.unshift([p, n]);
      n = p;
    }
    return edges;
  }

  // Called on click. Returns the same anchor-rooted path; already-allocated nodes
  // in it are no-ops because the store's allocate() is a set-union.
  nodesToAllocate(_allocated: Set<NodeId>, target: NodeId): NodeId[] {
    const parent = this.bfsFromAnchor(target);
    if (!parent) return [];
    return this.reconstructPath(parent, target);
  }

  orphansOnRemove(allocated: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
    return findOrphansOnRemove(allocated, nodeId, this.graph, this.nodes, this.forbidden);
  }
}
