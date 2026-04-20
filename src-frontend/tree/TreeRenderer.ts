import { Application, Circle, Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { PassiveTree } from "../types/tree";
import { nodeWorldPosition } from "./geometry";
import { drawConnections } from "./ConnectionRenderer";
import { drawNode, type NodeVisualState } from "./NodeSprite";

export class TreeRenderer {
  private app: Application;
  private viewport!: Viewport;
  private connectionLayer = new Graphics();
  private nodeLayer = new Container();
  private nodeGraphics = new Map<number, Graphics>();
  private tree: PassiveTree;

  onNodeHover?: (id: number | null) => void;
  onNodeClick?: (id: number) => void;

  constructor(tree: PassiveTree) {
    this.tree = tree;
    this.app = new Application();
  }

  async init(canvas: HTMLCanvasElement) {
    await this.app.init({
      canvas,
      resizeTo: canvas.parentElement ?? window,
      backgroundColor: 0x0e0e11,
      antialias: true,
    });

    const worldWidth = this.tree.max_x - this.tree.min_x;
    const worldHeight = this.tree.max_y - this.tree.min_y;
    const centerX = (this.tree.min_x + this.tree.max_x) / 2;
    const centerY = (this.tree.min_y + this.tree.max_y) / 2;

    this.viewport = new Viewport({
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
      worldWidth,
      worldHeight,
      events: this.app.renderer.events,
    });
    this.viewport.drag().pinch().wheel().decelerate();
    const fitZoom = Math.min(
      this.app.renderer.width / worldWidth,
      this.app.renderer.height / worldHeight,
    ) * 0.9;
    this.viewport.setZoom(fitZoom);
    this.viewport.moveCenter(centerX, centerY);

    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.connectionLayer);
    this.viewport.addChild(this.nodeLayer);

    // Temporarily hiding connections by default to verify node positions.
    // Restore with `?lines` query param, or remove this guard once positions verified.
    const showConnections = new URLSearchParams(window.location.search).has("lines");
    if (showConnections) {
      drawConnections(this.connectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants);
    }

    for (const [idStr, node] of Object.entries(this.tree.nodes)) {
      const id = Number(idStr);
      const pos = nodeWorldPosition(node, this.tree.groups, this.tree.constants);
      const g = new Graphics();
      g.position.set(pos.x, pos.y);
      drawNode(g, node, "unallocated");
      g.eventMode = "static";
      g.cursor = "pointer";
      g.hitArea = new Circle(0, 0, 20);
      g.on("pointerover", () => this.onNodeHover?.(id));
      g.on("pointerout", () => this.onNodeHover?.(null));
      g.on("pointertap", () => this.onNodeClick?.(id));
      this.nodeLayer.addChild(g);
      this.nodeGraphics.set(id, g);
    }
  }

  applyAllocations(allocated: Set<number>, pathing: Set<number>, hovered: number | null) {
    for (const [id, g] of this.nodeGraphics) {
      const node = this.tree.nodes[String(id)];
      if (!node) continue;
      let state: NodeVisualState = "unallocated";
      if (allocated.has(id)) state = "allocated";
      else if (pathing.has(id)) state = "pathing";
      if (hovered === id) state = "hovered";
      drawNode(g, node, state);
    }
  }

  destroy() {
    this.app.destroy(true, { children: true });
  }
}
