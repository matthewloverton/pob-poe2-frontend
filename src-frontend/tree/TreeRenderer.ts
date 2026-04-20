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
  private nodeStates = new Map<number, NodeVisualState>();
  private tree: PassiveTree;
  private resizeObserver: ResizeObserver | null = null;

  onNodeHover?: (id: number | null) => void;
  onNodeClick?: (id: number) => void;

  constructor(tree: PassiveTree) {
    this.tree = tree;
    this.app = new Application();
  }

  async init(canvas: HTMLCanvasElement) {
    const parent = canvas.parentElement;
    await this.app.init({
      canvas,
      resizeTo: parent ?? window,
      backgroundColor: 0x0e0e11,
      antialias: true,
    });

    // Pixi's resizeTo only listens to window resize. In Tauri, maximising can
    // change the parent's size without a window resize event (especially across
    // HMR reloads). A ResizeObserver on the parent catches those cases.
    if (parent) {
      this.resizeObserver = new ResizeObserver(() => {
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        this.app.renderer.resize(w, h);
        if (this.viewport) this.viewport.resize(w, h);
      });
      this.resizeObserver.observe(parent);
    }

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

    drawConnections(this.connectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants);

    for (const [idStr, node] of Object.entries(this.tree.nodes)) {
      const id = Number(idStr);
      if (!this.isRenderableNode(node)) continue;
      const pos = nodeWorldPosition(node, this.tree.groups, this.tree.constants);
      const g = new Graphics();
      g.position.set(pos.x, pos.y);
      drawNode(g, node, "unallocated");
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => this.onNodeHover?.(id));
      g.on("pointerout", () => this.onNodeHover?.(null));
      g.on("pointertap", () => this.onNodeClick?.(id));
      this.nodeLayer.addChild(g);
      this.nodeGraphics.set(id, g);
      this.nodeStates.set(id, "unallocated");
    }

    // Hit areas live in world coords, so at low zoom a fixed world radius
    // collapses to a sub-pixel click target. Rescale on zoom to keep a
    // consistent ~18-pixel click region regardless of camera scale.
    const SCREEN_HIT_PIXELS = 18;
    const updateHitAreas = () => {
      const worldRadius = SCREEN_HIT_PIXELS / Math.max(this.viewport.scale.x, 1e-6);
      for (const g of this.nodeGraphics.values()) {
        g.hitArea = new Circle(0, 0, worldRadius);
      }
    };
    updateHitAreas();
    this.viewport.on("zoomed", updateHitAreas);
    this.viewport.on("moved", updateHitAreas);
  }

  // Mirror PoB's render filter: proxy nodes, proxy groups, and nodes without a
  // usable skill effect aren't drawn in the main view.
  private isRenderableNode(node: import("../types/tree").PassiveNode): boolean {
    if (node["isProxy"] === true) return false;
    if (node.group != null) {
      const group = this.tree.groups[String(node.group)] as (import("../types/tree").PassiveGroup & { isProxy?: boolean }) | undefined;
      if (group?.isProxy) return false;
    }
    if (node["type"] === "OnlyImage") return false;
    return true;
  }

  applyAllocations(allocated: Set<number>, pathing: Set<number>, hovered: number | null) {
    // Only redraw nodes whose visual state changed. Redrawing all ~4700 nodes
    // on every hover was enough to stutter pan/drag interactions.
    for (const [id, g] of this.nodeGraphics) {
      let state: NodeVisualState = "unallocated";
      if (allocated.has(id)) state = "allocated";
      else if (pathing.has(id)) state = "pathing";
      if (hovered === id) state = "hovered";
      if (this.nodeStates.get(id) === state) continue;
      const node = this.tree.nodes[String(id)];
      if (!node) continue;
      drawNode(g, node, state);
      this.nodeStates.set(id, state);
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.destroy(true, { children: true });
  }
}
