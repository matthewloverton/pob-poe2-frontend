import { Graphics } from "pixi.js";
import type { PassiveNode, PassiveGroup, TreeConstants } from "../types/tree";
import { nodeWorldPosition } from "./geometry";

export interface DrawConnectionsOptions {
  color: number;
  width: number;
  filter?: (aId: number, bId: number) => boolean;
  // Overlays (allocated / pathing / removing) need the edges from class-start
  // nodes so a path visibly begins at the class anchor. The base connection
  // layer leaves them hidden to avoid visual clutter under the class portrait.
  includeClassStartEdges?: boolean;
}

export function drawConnections(
  g: Graphics,
  nodes: Record<string, PassiveNode>,
  groups: Record<string, PassiveGroup>,
  constants: TreeConstants,
  opts: DrawConnectionsOptions = { color: 0x52525b, width: 3 },
) {
  g.clear();
  const drawn = new Set<string>();

  for (const [idStr, node] of Object.entries(nodes)) {
    const id = Number(idStr);
    const conns = Array.isArray(node.connections) ? node.connections : [];
    for (const conn of conns) {
      const neighborId = conn.id;
      if (neighborId === id) continue;
      const neighbor = nodes[String(neighborId)];
      if (!neighbor) continue;
      if (shouldSkipConnection(node, neighbor, opts.includeClassStartEdges ?? false)) continue;
      if (opts.filter && !opts.filter(id, neighborId)) continue;

      const key = id < neighborId ? `${id}-${neighborId}` : `${neighborId}-${id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const from = nodeWorldPosition(node, groups, constants);
      const to = nodeWorldPosition(neighbor, groups, constants);
      if (!Number.isFinite(from.x) || !Number.isFinite(to.x)) continue;

      const orbit = conn.orbit ?? 0;

      if (orbit !== 0) {
        if (tryDrawGeometricArc(g, from, to, orbit, constants)) continue;
      } else if (
        node.group != null && node.group === neighbor.group
        && node.orbit != null && node.orbit === neighbor.orbit
      ) {
        if (tryDrawSameOrbitArc(g, node, neighbor, groups, constants)) continue;
      }

      g.moveTo(from.x, from.y);
      g.lineTo(to.x, to.y);
    }
  }
  g.stroke({ color: opts.color, width: opts.width });
}

function shouldSkipConnection(a: PassiveNode, b: PassiveNode, allowClassStart: boolean): boolean {
  if (a["isOnlyImage"] === true || b["isOnlyImage"] === true) return true;
  if ((a.ascendancyName ?? null) !== (b.ascendancyName ?? null)) return true;
  if (!allowClassStart && (Array.isArray(a.classesStart) || Array.isArray(b.classesStart))) return true;
  return false;
}

// conn.orbit != 0: geometric arc through both endpoints. Center is the chord
// midpoint offset perpendicular to the chord by sqrt(r^2 - (d/2)^2). Sign of
// conn.orbit picks which side of the chord the center falls on.
function tryDrawGeometricArc(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  orbit: number,
  constants: TreeConstants,
): boolean {
  const r = constants.orbitRadii[Math.abs(orbit)];
  if (r == null || r <= 0) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.01 || dist >= 2 * r) return false;

  const perpScalar = Math.sqrt(r * r - (dist * dist) / 4) * (orbit > 0 ? 1 : -1);
  const cx = from.x + dx / 2 + (perpScalar * dy) / dist;
  const cy = from.y + dy / 2 - (perpScalar * dx) / dist;
  const angleA = Math.atan2(from.y - cy, from.x - cx);
  const angleB = Math.atan2(to.y - cy, to.x - cx);
  return drawArcPolyline(g, cx, cy, r, angleA, angleB);
}

// conn.orbit == 0 and both nodes share a group and orbit: arc along the orbit.
function tryDrawSameOrbitArc(
  g: Graphics,
  a: PassiveNode,
  b: PassiveNode,
  groups: Record<string, PassiveGroup>,
  constants: TreeConstants,
): boolean {
  const group = groups[String(a.group)];
  if (!group) return false;
  const radius = constants.orbitRadii[a.orbit ?? 0] ?? 0;
  if (radius <= 0) return false;
  const angles = constants.orbitAnglesByOrbit?.[a.orbit ?? 0];
  if (!angles) return false;
  const angleA = angles[a.orbitIndex ?? 0];
  const angleB = angles[b.orbitIndex ?? 0];
  if (angleA == null || angleB == null) return false;

  // Tree-coord angle (radians): 0 = straight up, increasing clockwise.
  // Convert to Pixi-canonical (0 = +x, increasing ccw in math terms).
  const pixiA = angleA - Math.PI / 2;
  const pixiB = angleB - Math.PI / 2;
  return drawArcPolyline(g, group.x, group.y, radius, pixiA, pixiB);
}

// Shared polyline arc drawer. Takes pixi-canonical angles (0 = +x, ccw positive).
// Picks the shorter of the two possible arcs (|diff| <= pi). Returns false if
// the arc would span more than 180 deg (lets caller fall back to straight line).
function drawArcPolyline(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  angleA: number,
  angleB: number,
): boolean {
  let diff = angleB - angleA;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) > Math.PI) return false;

  const degSpan = (Math.abs(diff) * 180) / Math.PI;
  const steps = Math.max(4, Math.ceil(degSpan / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = angleA + diff * t;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  return true;
}
