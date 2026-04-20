import type { PassiveNode, NodeId } from "../types/tree";

export type Graph = Map<NodeId, NodeId[]>;

// Upstream stores each edge on only one endpoint's `connections` array, but the
// tree is logically undirected — so mirror every edge onto both endpoints.
export function buildGraph(nodes: Record<string, PassiveNode>): Graph {
  const graph: Graph = new Map();
  const ensure = (id: NodeId): NodeId[] => {
    let list = graph.get(id);
    if (!list) { list = []; graph.set(id, list); }
    return list;
  };
  for (const [idStr, node] of Object.entries(nodes)) {
    const id = Number(idStr);
    ensure(id);
    const raw = node.connections;
    if (!Array.isArray(raw)) continue;
    for (const conn of raw) {
      ensure(id).push(conn.id);
      ensure(conn.id).push(id);
    }
  }
  return graph;
}

// Given a set of allocated nodes and a hypothetical removal, find which of the
// remaining allocated nodes would be orphaned from the class-start anchor(s).
// Anchor = any currently-allocated node whose `classesStart` is set.
export function findOrphansOnRemove(
  allocated: Set<NodeId>,
  removeId: NodeId,
  graph: Graph,
  nodes: Record<string, import("../types/tree").PassiveNode>,
): Set<NodeId> {
  const anchors = new Set<NodeId>();
  for (const id of allocated) {
    if (id === removeId) continue;
    const node = nodes[String(id)];
    if (node && Array.isArray(node.classesStart)) anchors.add(id);
  }
  if (anchors.size === 0) return new Set();

  const reached = new Set<NodeId>(anchors);
  const queue: NodeId[] = [...anchors];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph.get(current) ?? []) {
      if (next === removeId) continue;
      if (!allocated.has(next)) continue;
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  const orphans = new Set<NodeId>();
  for (const id of allocated) {
    if (id === removeId) continue;
    if (!reached.has(id)) orphans.add(id);
  }
  return orphans;
}

export function shortestPath(
  allocated: Set<NodeId>,
  to: NodeId,
  graph: Graph,
): NodeId[] | null {
  if (allocated.has(to)) return [];
  if (allocated.size === 0) return null;

  const visited = new Set<NodeId>(allocated);
  const parent = new Map<NodeId, NodeId>();
  const queue: NodeId[] = [...allocated];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = graph.get(current) ?? [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === to) {
        const path: NodeId[] = [];
        let n: NodeId | undefined = to;
        while (n !== undefined && !allocated.has(n)) {
          path.unshift(n);
          n = parent.get(n);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
