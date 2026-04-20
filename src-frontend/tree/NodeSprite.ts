import { Graphics } from "pixi.js";
import type { PassiveNode } from "../types/tree";

export type NodeVisualState = "unallocated" | "allocated" | "pathing" | "hovered" | "removing";

export function classifyNode(node: PassiveNode): "keystone" | "notable" | "socket" | "normal" {
  if (node.isKeystone) return "keystone";
  if (node.isNotable) return "notable";
  if (node.isJewelSocket) return "socket";
  return "normal";
}

const RADII = { keystone: 18, notable: 14, socket: 12, normal: 8 } as const;
const COLORS: Record<NodeVisualState, number> = {
  unallocated: 0x27272a,
  allocated: 0xfafafa,
  pathing: 0x06b6d4,
  hovered: 0xeab308,
  removing: 0xf43f5e,
};

export function drawNode(g: Graphics, node: PassiveNode, state: NodeVisualState) {
  g.clear();
  const kind = classifyNode(node);
  const r = RADII[kind];
  g.circle(0, 0, r);
  g.fill({ color: COLORS[state] });
  g.stroke({ color: 0x1d1d20, width: 1 });
}
