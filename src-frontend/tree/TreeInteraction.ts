import type { NodeId, PassiveNode } from "../types/tree";
import { buildGraph, findOrphansOnRemove, type Graph } from "../build/pathing";

export class TreeInteraction {
  private graph: Graph;
  private nodes: Record<string, PassiveNode>;
  private allClassStarts: Set<NodeId>;
  // Every node tagged with an ascendancyName, bucketed by ascendancy name so we
  // can selectively unlock the active ascendancy subtree while still walling
  // off the others.
  private ascendancyNodesByName = new Map<string, Set<NodeId>>();
  // Nodes that exist in the tree data but aren't rendered as interactive —
  // masteries with `isOnlyImage`, proxy stubs, etc. Always forbidden in
  // pathing so BFS can't bridge two visible notables via an invisible hub.
  private hiddenNodes: Set<NodeId> = new Set();
  private forbidden: Set<NodeId> = new Set();
  private activeClassStartId: NodeId | null = null;
  private activeAscendStartId: NodeId | null = null;
  private activeAscendancyName: string | null = null;

  constructor(nodes: Record<string, PassiveNode>) {
    this.nodes = nodes;
    this.graph = buildGraph(nodes);
    this.allClassStarts = new Set();
    for (const [idStr, node] of Object.entries(nodes)) {
      const id = Number(idStr);
      if (Array.isArray(node.classesStart)) this.allClassStarts.add(id);
      if ((node as unknown as { isProxy?: boolean }).isProxy === true) this.hiddenNodes.add(id);
      if ((node as unknown as { isOnlyImage?: boolean }).isOnlyImage === true) this.hiddenNodes.add(id);
      const ascName = (node as unknown as { ascendancyName?: string }).ascendancyName;
      if (typeof ascName === "string") {
        let bucket = this.ascendancyNodesByName.get(ascName);
        if (!bucket) { bucket = new Set(); this.ascendancyNodesByName.set(ascName, bucket); }
        bucket.add(id);
      }
    }
  }

  // Call whenever class or ascendancy changes. Forbids every class start that
  // isn't the active one, and every ascendancy subtree except the active one.
  setActiveAnchors(opts: {
    classStartId: NodeId | null;
    ascendStartId: NodeId | null;
    ascendancyName: string | null;
  }) {
    this.activeClassStartId = opts.classStartId;
    this.activeAscendStartId = opts.ascendStartId;
    this.activeAscendancyName = opts.ascendancyName;

    const forbidden = new Set<NodeId>();
    for (const sid of this.allClassStarts) forbidden.add(sid);
    for (const [name, bucket] of this.ascendancyNodesByName) {
      if (name === opts.ascendancyName) continue;
      for (const id of bucket) forbidden.add(id);
    }
    // Always forbid isProxy / isOnlyImage nodes (e.g. mastery hubs) so the
    // pathing BFS can't bridge two visible notables through an invisible
    // intermediate. These are never legitimate allocations anyway.
    for (const id of this.hiddenNodes) forbidden.add(id);
    if (opts.classStartId != null) forbidden.delete(opts.classStartId);
    if (opts.ascendStartId != null) forbidden.delete(opts.ascendStartId);
    this.forbidden = forbidden;
  }

  // Kept for callers that only know about the main class start; delegates to
  // setActiveAnchors with no active ascendancy.
  setActiveClassStart(startId: NodeId | null) {
    this.setActiveAnchors({ classStartId: startId, ascendStartId: null, ascendancyName: null });
  }

  private anchors(): Set<NodeId> {
    const s = new Set<NodeId>();
    if (this.activeClassStartId != null) s.add(this.activeClassStartId);
    if (this.activeAscendStartId != null) s.add(this.activeAscendStartId);
    return s;
  }

  // Multi-source BFS seeded from every allocated node plus the class/ascend
  // anchors. That way the returned path traces from whichever allocated node
  // is nearest to the target — matching PoB + PoE behaviour where clicking a
  // far node extends from your latest allocation, not from the class start.
  private bfsFromAnchor(allocated: Set<NodeId>, target: NodeId): Map<NodeId, NodeId> | null {
    const sources = new Set<NodeId>(this.anchors());
    for (const id of allocated) sources.add(id);
    if (sources.size === 0) return null;
    if (sources.has(target)) return new Map();
    if (this.forbidden.has(target)) return null;

    const visited = new Set<NodeId>(sources);
    const parent = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [...sources];

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
    const parent = this.bfsFromAnchor(allocated, hovered);
    if (!parent) return new Set();
    return new Set(this.reconstructPath(parent, hovered));
  }

  pathingEdges(allocated: Set<NodeId>, hovered: NodeId | null): Array<[NodeId, NodeId]> {
    if (hovered == null) return [];
    if (allocated.has(hovered)) return [];
    const parent = this.bfsFromAnchor(allocated, hovered);
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

  // Called on click. Returns the shortest path from any already-allocated node
  // (or the class/ascend anchor if nothing is allocated) to the target.
  nodesToAllocate(allocated: Set<NodeId>, target: NodeId): NodeId[] {
    const parent = this.bfsFromAnchor(allocated, target);
    if (!parent) return [];
    return this.reconstructPath(parent, target);
  }

  orphansOnRemove(allocated: Set<NodeId>, nodeId: NodeId): Set<NodeId> {
    return findOrphansOnRemove(allocated, nodeId, this.graph, this.nodes, this.forbidden);
  }
}
