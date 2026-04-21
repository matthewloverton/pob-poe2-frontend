import {
  Application,
  Container,
  Culler,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { PassiveTree, PassiveNode } from "../types/tree";
import { nodeWorldPosition } from "./geometry";
import { drawConnections } from "./ConnectionRenderer";
import {
  classifyNode,
  FILL_COLORS,
  iconTint,
  KIND_STROKE,
  RADII,
  STROKE_WIDTH,
  strokeColor,
  type NodeKind,
  type NodeVisualState,
} from "./NodeSprite";
import { frameTexture, loadAtlases, manifestKey, type AtlasFrame } from "./atlas";

const HIT_CELL_SIZE = 500;
const SCREEN_HIT_PIXELS = 18;

type RenderableNode = {
  id: number;
  node: PassiveNode;
  kind: NodeKind;
  x: number;
  y: number;
};

type NodePos = { id: number; x: number; y: number };

export class TreeRenderer {
  private app: Application;
  private viewport!: Viewport;

  // Base (static) layers — drawn once at init.
  private connectionLayer = new Graphics();
  private bgFillLayer = new Graphics();
  private bgStrokeLayer = new Graphics();
  private iconContainer = new Container();

  // Dynamic overlay layers — redrawn on allocation/hover state change.
  private allocatedMainLayer = new Graphics();
  private allocatedWs1Layer = new Graphics();
  private allocatedWs2Layer = new Graphics();
  private pathingConnectionLayer = new Graphics();
  private removingConnectionLayer = new Graphics();
  private overlayFillLayer = new Graphics();
  private overlayStrokeLayer = new Graphics();

  private lastPathingEdgeKey: string = "";
  private lastAllocKey: string = "";

  private nodes = new Map<number, RenderableNode>();
  private iconSprites = new Map<number, Sprite>();
  private nodeStates = new Map<number, NodeVisualState>();
  private lastAllocated: Set<number> = new Set();
  private lastRemoving: Set<number> = new Set();

  private spatialGrid = new Map<string, NodePos[]>();
  private lastHoveredId: number | null = null;

  private tree: PassiveTree;
  private resizeObserver: ResizeObserver | null = null;

  onNodeHover?: (id: number | null) => void;
  onNodeClick?: (id: number) => void;
  onProgress?: (pct: number, label: string) => void;
  onReady?: () => void;

  constructor(tree: PassiveTree) {
    this.tree = tree;
    this.app = new Application();
  }

  async init(canvas: HTMLCanvasElement) {
    this.onProgress?.(0, "Initialising renderer");

    const parent = canvas.parentElement;
    await this.app.init({
      canvas,
      resizeTo: parent ?? window,
      backgroundColor: 0x0e0e11,
      antialias: true,
    });

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
    const fitZoom = Math.min(
      this.app.renderer.width / worldWidth,
      this.app.renderer.height / worldHeight,
    );
    this.viewport
      .drag()
      .pinch()
      .wheel()
      .decelerate()
      .clampZoom({ minScale: fitZoom * 1.3, maxScale: fitZoom * 25 });
    this.viewport.setZoom(fitZoom * 2.5);
    this.viewport.moveCenter(centerX, centerY);

    this.app.stage.addChild(this.viewport);
    this.viewport.addChild(this.connectionLayer);
    this.viewport.addChild(this.allocatedMainLayer);
    this.viewport.addChild(this.allocatedWs1Layer);
    this.viewport.addChild(this.allocatedWs2Layer);
    this.viewport.addChild(this.pathingConnectionLayer);
    this.viewport.addChild(this.removingConnectionLayer);
    this.viewport.addChild(this.bgFillLayer);
    this.viewport.addChild(this.overlayFillLayer);
    this.viewport.addChild(this.iconContainer);
    this.viewport.addChild(this.bgStrokeLayer);
    this.viewport.addChild(this.overlayStrokeLayer);

    this.collectRenderableNodes();
    this.buildSpatialGrid();

    drawConnections(this.connectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants);

    this.drawBaseNodes();

    this.onProgress?.(0.3, "Loading atlases");
    const { manifest, sources } = await loadAtlases();
    this.onProgress?.(0.8, "Building sprites");
    this.buildIconSprites(manifest.frames, sources);

    this.setupHitTesting();
    this.setupCulling();

    this.onProgress?.(1, "Ready");
    this.onReady?.();
  }

  private collectRenderableNodes() {
    for (const [idStr, node] of Object.entries(this.tree.nodes)) {
      const id = Number(idStr);
      if (!this.isRenderableNode(node)) continue;
      const pos = nodeWorldPosition(node, this.tree.groups, this.tree.constants);
      this.nodes.set(id, { id, node, kind: classifyNode(node), x: pos.x, y: pos.y });
      this.nodeStates.set(id, "unallocated");
    }
  }

  private buildSpatialGrid() {
    for (const n of this.nodes.values()) {
      const key = this.cellKey(n.x, n.y);
      let bucket = this.spatialGrid.get(key);
      if (!bucket) { bucket = []; this.spatialGrid.set(key, bucket); }
      bucket.push({ id: n.id, x: n.x, y: n.y });
    }
  }

  // Static fill + stroke for every node in its unallocated state. Drawn once;
  // the overlay layers render on top for any node whose state differs.
  private drawBaseNodes() {
    this.bgFillLayer.clear();
    this.bgStrokeLayer.clear();
    for (const n of this.nodes.values()) {
      const r = RADII[n.kind];
      this.bgFillLayer.circle(n.x, n.y, r).fill({ color: FILL_COLORS.unallocated });
      this.bgStrokeLayer.circle(n.x, n.y, r).stroke({
        color: KIND_STROKE[n.kind],
        width: STROKE_WIDTH[n.kind],
      });
    }
  }

  private buildIconSprites(frames: Record<string, AtlasFrame>, sources: import("pixi.js").TextureSource[]) {
    for (const n of this.nodes.values()) {
      const iconPath = n.node.icon;
      if (typeof iconPath !== "string" || !iconPath) continue;
      const frame = frames[manifestKey(iconPath)];
      if (!frame) continue;

      const sprite = new Sprite(frameTexture(sources, frame));
      sprite.anchor.set(0.5);
      sprite.position.set(n.x, n.y);
      const target = RADII[n.kind] * 2;
      const maxDim = Math.max(frame.w, frame.h);
      sprite.scale.set(target / maxDim);
      sprite.tint = iconTint("unallocated");
      sprite.cullable = true;
      // cullArea is in the sprite's local (pre-scale) coordinate space, centred
      // on the anchor — Pixi multiplies it by the world transform on cull check.
      sprite.cullArea = new Rectangle(-frame.w / 2, -frame.h / 2, frame.w, frame.h);
      this.iconContainer.addChild(sprite);
      this.iconSprites.set(n.id, sprite);
    }
  }

  private setupCulling() {
    // Only icons are numerous enough to benefit from culling. Graphics layers
    // are single objects whose geometry lives on the GPU — cheap to render.
    this.iconContainer.cullableChildren = true;
    // skipUpdateTransform=false forces Pixi to compute fresh world transforms
    // before testing each sprite. Without it, mid-drag cull checks see stale
    // positions and cull sprites that should still be visible.
    const cull = () => Culler.shared.cull(this.iconContainer, this.app.renderer.screen, false);
    cull();
    this.viewport.on("moved", cull);
    this.viewport.on("zoomed", cull);
  }

  private setupHitTesting() {
    this.viewport.eventMode = "static";

    const resolve = (e: FederatedPointerEvent): number | null => {
      const world = this.viewport.toWorld(e.global);
      const radius = SCREEN_HIT_PIXELS / Math.max(this.viewport.scale.x, 1e-6);
      return this.findNodeAt(world.x, world.y, radius);
    };

    // Suppress click-to-allocate if the pointer moved more than a few pixels
    // between pointerdown and pointerup — that was a pan drag, not a tap.
    const DRAG_TOLERANCE_PX = 4;
    let pointerDown: { x: number; y: number } | null = null;

    this.viewport.on("pointerdown", (e: FederatedPointerEvent) => {
      pointerDown = { x: e.global.x, y: e.global.y };
    });

    this.viewport.on("pointermove", (e: FederatedPointerEvent) => {
      const id = resolve(e);
      if (id !== this.lastHoveredId) {
        this.lastHoveredId = id;
        this.onNodeHover?.(id);
      }
    });

    this.viewport.on("pointerup", (e: FederatedPointerEvent) => {
      const start = pointerDown;
      pointerDown = null;
      if (!start) return;
      const dx = e.global.x - start.x;
      const dy = e.global.y - start.y;
      if (dx * dx + dy * dy > DRAG_TOLERANCE_PX * DRAG_TOLERANCE_PX) return;
      const id = resolve(e);
      if (id != null) this.onNodeClick?.(id);
    });

    this.viewport.on("pointerleave", () => {
      pointerDown = null;
      if (this.lastHoveredId != null) {
        this.lastHoveredId = null;
        this.onNodeHover?.(null);
      }
    });
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / HIT_CELL_SIZE)},${Math.floor(y / HIT_CELL_SIZE)}`;
  }

  private findNodeAt(wx: number, wy: number, radius: number): number | null {
    const cellsRadius = Math.ceil(radius / HIT_CELL_SIZE);
    const cx = Math.floor(wx / HIT_CELL_SIZE);
    const cy = Math.floor(wy / HIT_CELL_SIZE);
    const maxDistSq = radius * radius;
    let bestId: number | null = null;
    let bestDistSq = maxDistSq;
    for (let dx = -cellsRadius; dx <= cellsRadius; dx++) {
      for (let dy = -cellsRadius; dy <= cellsRadius; dy++) {
        const bucket = this.spatialGrid.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const { id, x, y } of bucket) {
          const d = (x - wx) ** 2 + (y - wy) ** 2;
          if (d < bestDistSq) { bestDistSq = d; bestId = id; }
        }
      }
    }
    return bestId;
  }

  private isRenderableNode(node: PassiveNode): boolean {
    if (node["isProxy"] === true) return false;
    if (node["isOnlyImage"] === true) return false;
    if (node.group != null) {
      const group = this.tree.groups[String(node.group)] as (import("../types/tree").PassiveGroup & { isProxy?: boolean }) | undefined;
      if (group?.isProxy) return false;
    }
    return true;
  }

  focusNode(id: number) {
    const n = this.nodes.get(id);
    if (!n) return;
    const minZoom = 0.5;
    if (this.viewport.scale.x < minZoom) this.viewport.setZoom(minZoom, true);
    this.viewport.moveCenter(n.x, n.y);
  }

  applyAllocations(
    allocated: Set<number>,
    pathing: Set<number>,
    hovered: number | null,
    removing: Set<number> = new Set(),
    pathingEdges: Array<[number, number]> = [],
    allocMode: 0 | 1 | 2 = 0,
    nodeModes: Record<number, 0 | 1 | 2> = {},
  ) {
    let stateChanged = false;
    const stateById = new Map<number, NodeVisualState>();
    for (const [id] of this.nodes) {
      let state: NodeVisualState;
      if (removing.has(id)) state = "removing";
      else if (hovered === id) state = "hovered";
      else if (allocated.has(id)) state = "allocated";
      else if (pathing.has(id)) state = "pathing";
      else state = "unallocated";
      stateById.set(id, state);
      if (this.nodeStates.get(id) !== state) {
        stateChanged = true;
        this.nodeStates.set(id, state);
        const sprite = this.iconSprites.get(id);
        if (sprite) sprite.tint = iconTint(state);
      }
    }

    if (stateChanged) this.redrawOverlays(stateById);

    // Path-preview edges. Rebuild the filter only when the edge set changes so
    // we aren't redrawing thousands of arcs on every pointermove.
    const edgeOnly = pathingEdges
      .map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))
      .sort()
      .join("|");
    // Include allocMode so switching modes recolours the preview even when the
    // edge set itself didn't change.
    const pathingEdgeKey = `${allocMode}|${edgeOnly}`;
    if (pathingEdgeKey !== this.lastPathingEdgeKey) {
      this.lastPathingEdgeKey = pathingEdgeKey;
      if (pathingEdges.length === 0) {
        this.pathingConnectionLayer.clear();
      } else {
        const edgeSet = new Set(edgeOnly.split("|"));
        drawConnections(
          this.pathingConnectionLayer,
          this.tree.nodes,
          this.tree.groups,
          this.tree.constants,
          {
            // Mode-coloured preview: cyan for main tree, red/green for the two
            // weapon-set banks so the user can see which bank they're about to
            // spend into.
            color: allocMode === 1 ? 0xf87171 : allocMode === 2 ? 0x4ade80 : 0x06b6d4,
            width: 4,
            includeClassStartEdges: true,
            filter: (a, b) => edgeSet.has(a < b ? `${a}-${b}` : `${b}-${a}`),
          },
        );
      }
    }

    // Rebuild allocated-edge layers when allocation, removing-preview, or any
    // node-mode assignment changes. Keying on the JSON of nodeModes is cheap
    // because the object is small and only mutated on allocate/deallocate.
    const allocKey =
      [...allocated].sort().join(",") +
      "|" + [...removing].sort().join(",") +
      "|" + JSON.stringify(nodeModes);
    if (allocKey !== this.lastAllocKey) {
      this.lastAllocKey = allocKey;
      const isKept = (id: number) => allocated.has(id) && !removing.has(id);
      const edgeMode = (a: number, b: number): 0 | 1 | 2 => {
        const ma = nodeModes[a] ?? 0;
        const mb = nodeModes[b] ?? 0;
        // If either endpoint belongs to a weapon set, the edge does too.
        if (ma !== 0) return ma;
        if (mb !== 0) return mb;
        return 0;
      };
      drawConnections(
        this.allocatedMainLayer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0xfafafa, width: 4, includeClassStartEdges: true,
          filter: (a, b) => isKept(a) && isKept(b) && edgeMode(a, b) === 0,
        },
      );
      drawConnections(
        this.allocatedWs1Layer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0xf87171, width: 4, includeClassStartEdges: true,
          filter: (a, b) => isKept(a) && isKept(b) && edgeMode(a, b) === 1,
        },
      );
      drawConnections(
        this.allocatedWs2Layer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0x4ade80, width: 4, includeClassStartEdges: true,
          filter: (a, b) => isKept(a) && isKept(b) && edgeMode(a, b) === 2,
        },
      );
      drawConnections(
        this.removingConnectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0xf43f5e, width: 4, includeClassStartEdges: true,
          filter: (a, b) =>
            (removing.has(a) || removing.has(b)) && allocated.has(a) && allocated.has(b),
        },
      );
      this.lastAllocated = new Set(allocated);
      this.lastRemoving = new Set(removing);
    }
  }

  // Redraw the overlay fill + stroke layers from scratch with every non-unallocated
  // node. Typical sizes are well under a hundred, so this is cheap.
  private redrawOverlays(stateById: Map<number, NodeVisualState>) {
    this.overlayFillLayer.clear();
    this.overlayStrokeLayer.clear();
    for (const [id, state] of stateById) {
      if (state === "unallocated") continue;
      const n = this.nodes.get(id);
      if (!n) continue;
      const r = RADII[n.kind];
      this.overlayFillLayer.circle(n.x, n.y, r).fill({ color: FILL_COLORS[state] });
      this.overlayStrokeLayer.circle(n.x, n.y, r).stroke({
        color: strokeColor(n.kind, state),
        width: STROKE_WIDTH[n.kind],
      });
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.destroy(true, { children: true });
  }
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
