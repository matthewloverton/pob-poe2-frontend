import {
  Application,
  Assets,
  Container,
  Culler,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
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
import { frameNameFor, FRAME_DIAMETER, ASCEND_FRAME_DIAMETER, ASCEND_ROOT_FRAME } from "./NodeFrame";
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
  // Real game-art node rings (PSSkillFrame / NotableFrame / KeystoneFrame /
  // JewelFrame + per-ascendancy variants). Sits between overlays and icons so
  // the frame art surrounds the icon and the fill/pathing overlays show
  // through its transparent center.
  private frameContainer = new Container();
  private frameSprites = new Map<number, Sprite>();
  // Sits behind everything — holds class/ascendancy portraits + ornate frames.
  private backgroundContainer = new Container();
  private bgManifest: Record<string, { file: string; width: number; height: number }> | null = null;
  private bgSprites = {
    classPortrait: null as Sprite | null,
    bgTree: null as Sprite | null,
    bgTreeActive: null as Sprite | null,
    // ascendancy bg sprites keyed by ascendancy name
    ascendancyBgs: new Map<string, Sprite>(),
  };

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
  // Retained post-init so we can swap icon textures for multi-option nodes
  // (attribute picks etc.) when the user changes their selection at runtime.
  private atlasFrames: Record<string, AtlasFrame> | null = null;
  private atlasSources: import("pixi.js").TextureSource[] | null = null;

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
    this.viewport.addChild(this.backgroundContainer);
    this.viewport.addChild(this.connectionLayer);
    this.viewport.addChild(this.allocatedMainLayer);
    this.viewport.addChild(this.allocatedWs1Layer);
    this.viewport.addChild(this.allocatedWs2Layer);
    this.viewport.addChild(this.pathingConnectionLayer);
    this.viewport.addChild(this.removingConnectionLayer);
    this.viewport.addChild(this.bgFillLayer);
    this.viewport.addChild(this.overlayFillLayer);
    this.viewport.addChild(this.frameContainer);
    this.viewport.addChild(this.iconContainer);
    this.viewport.addChild(this.bgStrokeLayer);
    this.viewport.addChild(this.overlayStrokeLayer);

    this.collectRenderableNodes();
    this.buildSpatialGrid();

    drawConnections(this.connectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants);

    this.drawBaseNodes();

    this.onProgress?.(0.3, "Loading atlases");
    const { manifest, sources } = await loadAtlases();
    this.atlasFrames = manifest.frames;
    this.atlasSources = sources;
    this.onProgress?.(0.8, "Building sprites");
    this.buildIconSprites(manifest.frames, sources);
    try {
      const resp = await fetch("/tree-backgrounds/manifest.json");
      if (resp.ok) this.bgManifest = await resp.json();
    } catch { /* non-fatal — backgrounds just won't render */ }
    if (this.bgManifest) {
      await this.preloadPortraits();
      await this.buildFrameSprites();
    }

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
      // Dark disc beneath the icon so allocated/pathing/unallocated tints have
      // something to colour. The stroke is handled by the frame container's
      // actual game-art border, so we skip the drawn ring here.
      this.bgFillLayer.circle(n.x, n.y, r).fill({ color: FILL_COLORS.unallocated });
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

  // Kept as an instance field so focusNode() and other programmatic viewport
  // updates can trigger a re-cull immediately — otherwise icons stay hidden
  // from the last cull pass until the user manually pans.
  private runCull: () => void = () => {};

  private setupCulling() {
    // Only icons are numerous enough to benefit from culling. Graphics layers
    // are single objects whose geometry lives on the GPU — cheap to render.
    this.iconContainer.cullableChildren = true;
    // skipUpdateTransform=false forces Pixi to compute fresh world transforms
    // before testing each sprite. Without it, mid-drag cull checks see stale
    // positions and cull sprites that should still be visible.
    this.runCull = () => Culler.shared.cull(this.iconContainer, this.app.renderer.screen, false);
    this.runCull();
    this.viewport.on("moved", this.runCull);
    this.viewport.on("zoomed", this.runCull);
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
    // Class-start anchors sit at each class's spawn point and get hidden behind
    // the class portrait art. Skipping them here keeps pathing intact (BFS
    // uses the raw tree graph, not this renderable set) while removing the
    // little circle that otherwise pokes out of the portrait center.
    if (Array.isArray((node as unknown as { classesStart?: unknown[] }).classesStart)) return false;
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
    // pixi-viewport's moveCenter doesn't always emit "moved" for programmatic
    // jumps, so icons can linger with stale cull state until the next user
    // drag. Force the cull pass here so search→focus immediately reveals the
    // icons at the new viewport position.
    this.runCull();
  }

  // Warm the Pixi Assets cache for every class + ascendancy portrait + the
  // two BGTree frames up-front. applyBackgrounds would otherwise lazy-load
  // each on first selection, which has proven flaky — textures occasionally
  // don't materialise until the user clicks their ascendancy. With the cache
  // pre-populated, applyBackgrounds' Promise.all resolves instantly and the
  // sprites are always created on the first pass.
  private async preloadPortraits() {
    if (!this.bgManifest) return;
    const names = new Set<string>(["BGTree", "BGTreeActive"]);
    for (const klass of this.tree.classes ?? []) {
      if (klass.background?.image) names.add(klass.background.image);
      for (const asc of klass.ascendancies ?? []) {
        if (asc.background?.image) names.add(asc.background.image);
      }
    }
    const urls: string[] = [];
    for (const name of names) {
      const entry = this.bgManifest[name];
      if (entry) urls.push(`/tree-backgrounds/${entry.file}`);
    }
    try {
      await Promise.all(urls.map((u) => Assets.load<Texture>(u)));
    } catch { /* individual failures are fine — applyBackgrounds retries. */ }
  }

  // Diameter (in tree-world units) for the frame around a node. Ascendancy
  // nodes use their own ornate per-ascend frames at a slightly different size
  // to match the game-art detail level. Ascendancy root nodes (name ==
  // ascendancyName — the click target that swaps ascendancy) use the gold
  // diamond AscendancyMiddle art instead.
  private frameDiameter(kind: NodeKind, ascendancyName?: string, isRoot = false): number {
    if (isRoot) return ASCEND_FRAME_DIAMETER.middle;
    if (ascendancyName) {
      return kind === "notable" ? ASCEND_FRAME_DIAMETER.large : ASCEND_FRAME_DIAMETER.small;
    }
    return FRAME_DIAMETER[kind];
  }

  // True when a node is the root of its ascendancy subtree — PoB marks these
  // by having `name === ascendancyName`. Clicking them swaps ascendancy
  // (handled in TreeCanvas) rather than allocating the node.
  private isAscendancyRoot(node: PassiveNode): boolean {
    const ascend = (node as unknown as { ascendancyName?: string }).ascendancyName;
    return typeof ascend === "string" && (node.name as string | undefined) === ascend;
  }

  // Create one frame sprite per renderable node using the initial
  // "unallocated" state. Textures are loaded lazily on first use; Pixi's
  // Assets cache keeps subsequent swaps cheap. No-op if the manifest failed
  // to load.
  private async buildFrameSprites() {
    if (!this.bgManifest) return;
    for (const n of this.nodes.values()) {
      const ascend = (n.node as unknown as { ascendancyName?: string }).ascendancyName;
      const isRoot = this.isAscendancyRoot(n.node);
      const frameName = isRoot ? ASCEND_ROOT_FRAME : frameNameFor(n.kind, "unallocated", ascend);
      if (!frameName) continue;
      const tex = await this.loadBackground(frameName);
      if (!tex) continue;
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.position.set(n.x, n.y);
      const d = this.frameDiameter(n.kind, ascend, isRoot);
      sprite.width = d;
      sprite.height = d;
      sprite.cullable = true;
      sprite.cullArea = new Rectangle(-d / 2, -d / 2, d, d);
      this.frameContainer.addChild(sprite);
      this.frameSprites.set(n.id, sprite);
      // Ascendancy root nodes are click-targets for swapping ascendancy, not
      // allocatable passives — the gold diamond frame is the whole visual,
      // so hide the (generic ascendancy) icon that would otherwise sit inside.
      if (isRoot) {
        const iconSprite = this.iconSprites.get(n.id);
        if (iconSprite) iconSprite.visible = false;
      }
    }
    this.frameContainer.cullableChildren = true;
  }

  // Swap a single node's frame texture to match its current visual state.
  // Called from applyAllocations whenever the state actually transitions.
  private async applyFrameState(id: number, state: NodeVisualState) {
    const sprite = this.frameSprites.get(id);
    if (!sprite) return;
    const r = this.nodes.get(id);
    if (!r) return;
    // Ascendancy root frames don't vary by state — the gold diamond is
    // always drawn. Clicking one swaps ascendancy rather than allocating.
    if (this.isAscendancyRoot(r.node)) return;
    const ascend = (r.node as unknown as { ascendancyName?: string }).ascendancyName;
    const frameName = frameNameFor(r.kind, state, ascend);
    if (!frameName) return;
    const tex = await this.loadBackground(frameName);
    if (tex) sprite.texture = tex;
  }

  // Load a background webp by its logical name (e.g. "ClassesRanger",
  // "BGTree"). Results are cached by Pixi Assets under the asset URL. Returns
  // null if the manifest hasn't loaded or the name isn't in it.
  private async loadBackground(name: string): Promise<Texture | null> {
    const entry = this.bgManifest?.[name];
    if (!entry) return null;
    try {
      const tex = await Assets.load<Texture>(`/tree-backgrounds/${entry.file}`);
      return tex ?? null;
    } catch { return null; }
  }

  private async setSpriteTo(
    slot: "classPortrait" | "bgTree" | "bgTreeActive",
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const tex = await this.loadBackground(name);
    if (!tex) return;
    let s = this.bgSprites[slot];
    if (!s) {
      s = new Sprite(tex);
      s.anchor.set(0.5);
      this.backgroundContainer.addChild(s);
      this.bgSprites[slot] = s;
    } else {
      s.texture = tex;
    }
    s.position.set(x, y);
    s.width = width;
    s.height = height;
    s.visible = true;
  }

  // Install / swap the class + ascendancy backgrounds. Called whenever the
  // user's class or ascendancy changes. Rotation of BGTreeActive points from
  // the class center toward the class-start node for flavor.
  // Serializes concurrent applyBackgrounds calls (init race + effect fires)
  // so that one run fully completes before the next starts applying changes.
  // Without this the two runs interleave their awaits and a partial sprite
  // set can be left on the container.
  private backgroundsPending: Promise<void> = Promise.resolve();

  async applyBackgrounds(opts: {
    classId: number;
    ascendancyId: number;
    classStartId: number | null;
  }) {
    const run = this.backgroundsPending.then(() => this.applyBackgroundsImpl(opts));
    this.backgroundsPending = run.catch(() => undefined);
    return run;
  }

  private async applyBackgroundsImpl(opts: {
    classId: number;
    ascendancyId: number;
    // Node id of the active class start; the renderer resolves its world
    // position via its group. Raw tree.nodes entries have no x/y fields.
    classStartId: number | null;
  }) {
    if (!this.bgManifest || !this.tree.classes) return;
    // classId throughout the app is a ZERO-BASED INDEX into tree.classes[]
    // (see build/classStarts.ts). The `integerId` field is a game-engine id
    // that doesn't match that index.
    const klass = this.tree.classes[opts.classId];
    if (!klass || !klass.background) return;

    // PoB's DrawAsset convention: width/height fields are half-sizes, it draws
    // at `width*2, height*2`. Our anchor is centered, so match by doubling.
    const DRAW_SCALE = 2;

    const ascList = klass.ascendancies ?? [];
    const activeAscend = opts.ascendancyId > 0 ? ascList[opts.ascendancyId - 1] : undefined;
    const portraitName = activeAscend?.background?.image ?? klass.background.image;
    const cx = klass.background.x;
    const cy = klass.background.y;

    // Collect every ascendancy across ALL classes so the tree shows every
    // ascendancy backdrop at its actual position — not just those belonging
    // to the active class. Inactive ones still dim to 0.75 alpha.
    const allAscendancies = this.tree.classes
      .flatMap((c) => c.ascendancies ?? [])
      .filter((a) => a.background?.image);

    // Gather every background texture needed in one batch so they load in
    // parallel. The ascendancy textures in particular used to stall behind
    // the class portrait/frame await chain.
    const ascBackgrounds = allAscendancies.map((a) => a.background!.image);
    const [portraitTex, bgTreeActiveTex, bgTreeTex, ...ascTextures] = await Promise.all([
      this.loadBackground(portraitName),
      this.loadBackground("BGTreeActive"),
      this.loadBackground("BGTree"),
      ...ascBackgrounds.map((n) => this.loadBackground(n)),
    ]);

    const applyOrCreate = (
      slot: "classPortrait" | "bgTree" | "bgTreeActive",
      tex: Texture | null,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      if (!tex) return;
      let s = this.bgSprites[slot];
      if (!s) {
        s = new Sprite(tex);
        s.anchor.set(0.5);
        this.backgroundContainer.addChild(s);
        this.bgSprites[slot] = s;
      } else {
        s.texture = tex;
      }
      s.position.set(x, y);
      s.width = w;
      s.height = h;
      s.visible = true;
    };

    applyOrCreate(
      "classPortrait",
      portraitTex,
      cx,
      cy,
      klass.background.width * DRAW_SCALE,
      klass.background.height * DRAW_SCALE,
    );

    const activeSize = klass.background.active ?? { width: 2000, height: 2000 };
    applyOrCreate(
      "bgTreeActive",
      bgTreeActiveTex,
      cx,
      cy,
      activeSize.width * DRAW_SCALE,
      activeSize.height * DRAW_SCALE,
    );
    const bgActive = this.bgSprites.bgTreeActive;
    if (bgActive && opts.classStartId != null) {
      const startNode = this.tree.nodes[String(opts.classStartId)];
      if (startNode) {
        const pos = nodeWorldPosition(startNode, this.tree.groups, this.tree.constants);
        bgActive.rotation = Math.PI / 2 + Math.atan2(pos.y - cy, pos.x - cx);
      }
    }

    const bgFrameSize = klass.background.bg ?? { width: 2000, height: 2000 };
    applyOrCreate(
      "bgTree",
      bgTreeTex,
      cx,
      cy,
      bgFrameSize.width * DRAW_SCALE,
      bgFrameSize.height * DRAW_SCALE,
    );

    // Ascendancy subtree backgrounds for every class. ascTextures[i] aligns
    // with allAscendancies[i] because Promise.all preserves order.
    for (let i = 0; i < allAscendancies.length; i++) {
      const asc = allAscendancies[i];
      const tex = ascTextures[i] ?? null;
      if (!asc || !tex || !asc.background) continue;
      let s = this.bgSprites.ascendancyBgs.get(asc.name);
      if (!s) {
        s = new Sprite(tex);
        s.anchor.set(0.5);
        this.backgroundContainer.addChild(s);
        this.bgSprites.ascendancyBgs.set(asc.name, s);
      } else {
        s.texture = tex;
      }
      s.position.set(asc.background.x, asc.background.y);
      s.width = asc.background.width * DRAW_SCALE;
      s.height = asc.background.height * DRAW_SCALE;
      // Active ascendancy gets full alpha; inactive ones (and ascendancies of
      // non-active classes) dim to 0.75 so they recede without disappearing.
      s.alpha = activeAscend && activeAscend.name === asc.name ? 1.0 : 0.75;
      s.visible = true;
    }
  }

  // Tracks which nodes currently have an overridden icon so we know to
  // revert them when the override is cleared on deallocate.
  private overriddenNodeIds = new Set<number>();

  // Swap sprite textures for nodes with a picked option (e.g. +5 Str choice
  // on a "+5 to any Attribute" node). Called whenever the user's picks change.
  // Also restores the base icon for any node that was previously overridden
  // but no longer appears in the overrides map — so deallocating an attribute
  // node correctly reverts the icon to the generic "any Attribute" art.
  // No-op before init completes (atlas not yet loaded).
  applyOverrideIcons(overrides: Record<number, number>) {
    if (!this.atlasFrames || !this.atlasSources) return;

    const applyIconPath = (id: number, iconPath: string | undefined) => {
      if (!iconPath) return;
      const sprite = this.iconSprites.get(id);
      if (!sprite) return;
      const frame = this.atlasFrames![manifestKey(iconPath)];
      if (!frame) return;
      // Preserve on-screen pixel size across the texture swap.
      const prevMax = Math.max(sprite.texture.width, sprite.texture.height);
      const targetPx = sprite.scale.x * prevMax;
      sprite.texture = frameTexture(this.atlasSources!, frame);
      const newMax = Math.max(frame.w, frame.h);
      if (newMax > 0) sprite.scale.set(targetPx / newMax);
      sprite.cullArea = new Rectangle(-frame.w / 2, -frame.h / 2, frame.w, frame.h);
    };

    // Apply / update overrides.
    const nextOverridden = new Set<number>();
    for (const [idStr, idx] of Object.entries(overrides)) {
      const id = Number(idStr);
      const node = this.tree.nodes[String(id)];
      const options = (node as unknown as { options?: { icon?: string }[] })?.options;
      const opt = options?.[idx];
      if (!opt?.icon) continue;
      applyIconPath(id, opt.icon);
      nextOverridden.add(id);
    }

    // Revert any node previously overridden but now absent from the map.
    for (const id of this.overriddenNodeIds) {
      if (nextOverridden.has(id)) continue;
      const baseNode = this.tree.nodes[String(id)];
      const baseIcon = typeof (baseNode as unknown as { icon?: string })?.icon === "string"
        ? (baseNode as unknown as { icon: string }).icon
        : undefined;
      applyIconPath(id, baseIcon);
    }
    this.overriddenNodeIds = nextOverridden;
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
        // Frame texture follows the state (unalloc / can-alloc / allocated).
        void this.applyFrameState(id, state);
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
            includeClassStartEdges: false,
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
          color: 0xfafafa, width: 4, includeClassStartEdges: false,
          filter: (a, b) => isKept(a) && isKept(b) && edgeMode(a, b) === 0,
        },
      );
      drawConnections(
        this.allocatedWs1Layer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0xf87171, width: 4, includeClassStartEdges: false,
          filter: (a, b) => isKept(a) && isKept(b) && edgeMode(a, b) === 1,
        },
      );
      drawConnections(
        this.allocatedWs2Layer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0x4ade80, width: 4, includeClassStartEdges: false,
          filter: (a, b) => isKept(a) && isKept(b) && edgeMode(a, b) === 2,
        },
      );
      drawConnections(
        this.removingConnectionLayer, this.tree.nodes, this.tree.groups, this.tree.constants,
        {
          color: 0xf43f5e, width: 4, includeClassStartEdges: false,
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
      // Fill tints the inner disc for the state (green allocated / cyan path /
      // red removing / yellow hover). The border comes from the frame
      // container's game-art sprite so we skip the drawn stroke here.
      this.overlayFillLayer.circle(n.x, n.y, r).fill({ color: FILL_COLORS[state] });
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
