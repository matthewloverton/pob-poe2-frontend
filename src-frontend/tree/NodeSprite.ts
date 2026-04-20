import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { PassiveNode } from "../types/tree";

const ICON_CDN = "https://repoe-fork.github.io/poe2/";

export function iconUrl(node: PassiveNode): string | null {
  const icon = node["icon"];
  if (typeof icon !== "string" || !icon) return null;
  // Icon field is a DDS path like "Art/2DArt/SkillIcons/passives/LightningDamagenode.dds".
  // RePoE-Fork's PoE2 mirror hosts PNG renders at the same path with .dds swapped for .png.
  return ICON_CDN + icon.replace(/\.dds$/i, ".png");
}

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

export class NodeDisplay extends Container {
  readonly kind: ReturnType<typeof classifyNode>;
  private frame = new Graphics();
  private icon: Sprite | null = null;
  private node: PassiveNode;
  private state: NodeVisualState = "unallocated";

  constructor(node: PassiveNode) {
    super();
    this.node = node;
    this.kind = classifyNode(node);
    this.addChild(this.frame);
    drawNode(this.frame, node, this.state);
  }

  setState(state: NodeVisualState) {
    if (state === this.state) return;
    this.state = state;
    drawNode(this.frame, this.node, state);
    if (this.icon) {
      this.icon.tint = state === "unallocated" ? 0xa1a1aa : 0xffffff;
      this.icon.alpha = state === "unallocated" ? 0.85 : 1;
    }
  }

  setIcon(texture: Texture) {
    if (this.icon) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const target = RADII[this.kind] * 1.9;
    const maxDim = Math.max(texture.width, texture.height);
    const scale = maxDim > 0 ? target / maxDim : 1;
    sprite.scale.set(scale);
    sprite.tint = this.state === "unallocated" ? 0xa1a1aa : 0xffffff;
    sprite.alpha = this.state === "unallocated" ? 0.85 : 1;
    this.addChild(sprite);
    this.icon = sprite;
  }
}
