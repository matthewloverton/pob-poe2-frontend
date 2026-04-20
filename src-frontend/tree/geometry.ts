import type { PassiveNode, PassiveGroup, TreeConstants } from "../types/tree";

export interface Point { x: number; y: number; }

export function nodeWorldPosition(
  node: PassiveNode,
  groups: Record<string, PassiveGroup>,
  constants: TreeConstants,
): Point {
  if (node.group == null || node.orbit == null || node.orbitIndex == null) {
    return { x: 0, y: 0 };
  }
  const group = groups[String(node.group)];
  if (!group) return { x: 0, y: 0 };

  const radius = constants.orbitRadii[node.orbit] ?? 0;
  if (radius === 0) return { x: group.x, y: group.y };

  const angleDeg = constants.orbitAnglesByOrbit?.[node.orbit]?.[node.orbitIndex];
  if (angleDeg == null) return { x: group.x, y: group.y };
  const angle = (angleDeg * Math.PI) / 180;

  return {
    x: group.x + radius * Math.sin(angle),
    y: group.y - radius * Math.cos(angle),
  };
}

export function nodesShareOrbit(a: PassiveNode, b: PassiveNode): boolean {
  return a.group != null
    && b.group != null
    && a.group === b.group
    && a.orbit != null
    && b.orbit != null
    && a.orbit === b.orbit;
}
