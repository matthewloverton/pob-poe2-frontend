import { Graphics } from "pixi.js";
import type { PassiveNode } from "../types/tree";

export type NodeVisualState = "unallocated" | "allocated" | "pathing" | "hovered" | "removing";

export function classifyNode(node: PassiveNode): "keystone" | "notable" | "socket" | "normal" {
  if (node.isKeystone) return "keystone";
  if (node.isNotable) return "notable";
  if (node.isJewelSocket) return "socket";
  return "normal";
}

const RADII = { keystone: 18, notable: 14, socket: 12, normal: 6 } as const;
const STROKE_WIDTH = { keystone: 3, notable: 2, socket: 2, normal: 1 } as const;
const COLORS: Record<NodeVisualState, number> = {
  unallocated: 0x27272a,
  allocated: 0xfafafa,
  pathing: 0x06b6d4,
  hovered: 0xeab308,
  removing: 0xf43f5e,
};
// Kind-specific base stroke colour when unallocated — gives each type its own identity.
const KIND_STROKE: Record<ReturnType<typeof classifyNode>, number> = {
  keystone: 0x71717a,
  notable: 0x52525b,
  socket: 0x3f3f46,
  normal: 0x27272a,
};

function hexagonPoints(r: number): number[] {
  // Flat-top hexagon, inscribed radius r.
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}

function diamondPoints(r: number): number[] {
  return [0, -r, r, 0, 0, r, -r, 0];
}

export function drawNode(g: Graphics, node: PassiveNode, state: NodeVisualState) {
  g.clear();
  const kind = classifyNode(node);
  const r = RADII[kind];
  const fill = COLORS[state];
  const stroke = state === "unallocated" ? KIND_STROKE[kind] : fill;

  switch (kind) {
    case "keystone":
      g.circle(0, 0, r);
      break;
    case "notable":
      g.poly(hexagonPoints(r));
      break;
    case "socket":
      g.poly(diamondPoints(r));
      break;
    default:
      g.circle(0, 0, r);
      break;
  }
  g.fill({ color: fill });
  g.stroke({ color: stroke, width: STROKE_WIDTH[kind] });
}
