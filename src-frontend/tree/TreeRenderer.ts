import { Application, Container, Graphics } from "pixi.js";
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

    this.viewport = new Viewport({
      screenWidth: this.app.renderer.width,
      screenHeight: this.app.renderer.height,
      worldWidth,
      worldHeight,
      events: this.app.renderer.events,
    });
    this.viewport.drag().pinch().wheel().decelerate();
    this.viewport.moveCenter(0, 0);
    this.viewport.setZoom(0.2);

    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.connectionLayer);
    this.viewport.addChild(this.nodeLayer);

    drawConnections(this.connectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants);

    for (const [idStr, node] of Object.entries(this.tree.nodes)) {
      const id = Number(idStr);
      const pos = nodeWorldPosition(node, this.tree.groups, this.tree.constants);
      const g = new Graphics();
      g.position.set(pos.x, pos.y);
      drawNode(g, node, "unallocated");
      this.nodeLayer.addChild(g);
      this.nodeGraphics.set(id, g);
    }
  }

  setNodeState(id: number, state: NodeVisualState) {
    const g = this.nodeGraphics.get(id);
    if (!g) return;
    const node = this.tree.nodes[String(id)];
    if (!node) return;
    drawNode(g, node, state);
  }

  destroy() {
    this.app.destroy(true, { children: true });
  }
}
