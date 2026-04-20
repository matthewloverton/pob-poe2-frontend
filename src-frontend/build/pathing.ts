import type { PassiveNode, NodeId } from "../types/tree";

export type Graph = Map<NodeId, NodeId[]>;

export function buildGraph(nodes: Record<string, PassiveNode>): Graph {
  const graph: Graph = new Map();
  for (const [idStr, node] of Object.entries(nodes)) {
    const id = Number(idStr);
    const neighbors = (node.connections ?? []).map((c) => c.id);
    graph.set(id, neighbors);
  }
  return graph;
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
