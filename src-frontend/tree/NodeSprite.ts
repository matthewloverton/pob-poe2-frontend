import type { PassiveNode } from "../types/tree";

export type NodeKind = "keystone" | "notable" | "socket" | "normal";
export type NodeVisualState = "unallocated" | "allocated" | "pathing" | "hovered" | "removing";

export function classifyNode(node: PassiveNode): NodeKind {
  if (node.isKeystone) return "keystone";
  if (node.isNotable) return "notable";
  if (node.isJewelSocket) return "socket";
  return "normal";
}

export const RADII: Record<NodeKind, number> = {
  keystone: 64,
  notable: 48,
  socket: 40,
  normal: 22,
};

export const STROKE_WIDTH: Record<NodeKind, number> = {
  keystone: 8,
  notable: 7,
  socket: 6,
  normal: 4,
};

export const FILL_COLORS: Record<NodeVisualState, number> = {
  unallocated: 0x27272a,
  allocated: 0xfafafa,
  pathing: 0x06b6d4,
  hovered: 0xeab308,
  removing: 0xf43f5e,
};

// Kind-specific stroke colour when unallocated; for any other state the stroke
// matches the fill of that state.
export const KIND_STROKE: Record<NodeKind, number> = {
  keystone: 0xa1a1aa,
  notable: 0x71717a,
  socket: 0x52525b,
  normal: 0x3f3f46,
};

export function strokeColor(kind: NodeKind, state: NodeVisualState): number {
  return state === "unallocated" ? KIND_STROKE[kind] : FILL_COLORS[state];
}

export function iconTint(state: NodeVisualState): number {
  return state === "unallocated" ? 0xe4e4e7 : 0xffffff;
}
