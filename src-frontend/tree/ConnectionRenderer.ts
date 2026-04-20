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
    const conns = Array.isArray(node.connections) ? node.connections : [];
    for (const conn of conns) {
      const neighborId = conn.id;
      const key = id < neighborId ? `${id}-${neighborId}` : `${neighborId}-${id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const neighbor = nodes[String(neighborId)];
      if (!neighbor) continue;
      const to = nodeWorldPosition(neighbor, groups, constants);

      if (nodesShareOrbit(node, neighbor)) {
        drawArc(g, node, neighbor, groups, constants);
      } else {
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
      }
    }
  }
  g.stroke({ color: 0x3f3f46, width: 1.5 });
}

function drawArc(
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

  const diff = (((angleB - angleA) % 360) + 540) % 360 - 180;
  const startRad = ((angleA - 90) * Math.PI) / 180;
  const endRad = ((angleA + diff - 90) * Math.PI) / 180;

  g.arc(group.x, group.y, radius, startRad, endRad, diff < 0);
}
