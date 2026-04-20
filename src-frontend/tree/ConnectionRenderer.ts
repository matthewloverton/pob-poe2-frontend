import { Graphics } from "pixi.js";
import type { PassiveNode, PassiveGroup, TreeConstants } from "../types/tree";
import { nodeWorldPosition, nodesShareOrbit } from "./geometry";

export function drawConnections(
  g: Graphics,
  nodes: Record<string, PassiveNode>,
  groups: Record<string, PassiveGroup>,
  constants: TreeConstants,
) {
  g.clear();
  const drawn = new Set<string>();

  for (const [idStr, node] of Object.entries(nodes)) {
    const id = Number(idStr);
    const from = nodeWorldPosition(node, groups, constants);
    if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) continue;
    const conns = Array.isArray(node.connections) ? node.connections : [];
    for (const conn of conns) {
      const neighborId = conn.id;
      const key = id < neighborId ? `${id}-${neighborId}` : `${neighborId}-${id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const neighbor = nodes[String(neighborId)];
      if (!neighbor) continue;
      const to = nodeWorldPosition(neighbor, groups, constants);
      if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) continue;

      if (nodesShareOrbit(node, neighbor)) {
        drawArcPolyline(g, node, neighbor, groups, constants);
      } else {
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
      }
    }
  }
  g.stroke({ color: 0x3f3f46, width: 1.5 });
}

// Approximate a same-orbit arc as a short polyline using the same world-position
// math nodeWorldPosition uses. Avoids Pixi's Graphics.arc (which interacted
// badly with path batching) and guarantees endpoints land exactly on the nodes.
function drawArcPolyline(
  g: Graphics,
  a: PassiveNode,
  b: PassiveNode,
  groups: Record<string, PassiveGroup>,
  constants: TreeConstants,
) {
  const group = groups[String(a.group)];
  if (!group) return;
  const radius = constants.orbitRadii[a.orbit ?? 0] ?? 0;
  if (radius === 0) return;

  const angles = constants.orbitAnglesByOrbit?.[a.orbit ?? 0];
  if (!angles) return;
  const angleA = angles[a.orbitIndex ?? 0];
  const angleB = angles[b.orbitIndex ?? 0];
  if (angleA == null || angleB == null) return;

  // Pick the shorter angular direction so arcs follow the tree's layout.
  const diff = (((angleB - angleA) % 360) + 540) % 360 - 180;
  const steps = Math.max(4, Math.ceil(Math.abs(diff) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angleDeg = angleA + diff * t;
    const rad = (angleDeg * Math.PI) / 180;
    const x = group.x + radius * Math.sin(rad);
    const y = group.y - radius * Math.cos(rad);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}
