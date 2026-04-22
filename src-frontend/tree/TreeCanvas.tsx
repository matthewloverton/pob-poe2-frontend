import { useEffect, useMemo, useRef, useState } from "react";
import { TreeRenderer } from "./TreeRenderer";
import { TreeInteraction } from "./TreeInteraction";
import type { PassiveTree, NodeId } from "../types/tree";
import { countUserAllocated, useBuildStore } from "../build/buildStore";
import { useItemsStore } from "../items/itemsStore";
import { ascendanciesFor, classStartId as classStartIdFor } from "../build/classStarts";
import { checkAllocation, computePoints } from "../build/pointCounts";
import { buildGraph, shortestPath } from "../build/pathing";
import { NodeTooltip } from "../ui/NodeTooltip";
import { ItemTooltip } from "../items/ItemTooltip";
import { useFocusStore } from "./focusStore";

export function TreeCanvas({ tree }: { tree: PassiveTree }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);
  const interactionRef = useRef<TreeInteraction | null>(null);
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState<{ pct: number; label: string } | null>({
    pct: 0,
    label: "Preparing tree",
  });

  const allocated = useBuildStore((s) => s.allocated);
  const classStartId = useBuildStore((s) => s.classStartId);
  const classId = useBuildStore((s) => s.classId);
  const ascendStartId = useBuildStore((s) => s.ascendStartId);
  const ascendancyId = useBuildStore((s) => s.ascendancyId);
  const nodeOverrides = useBuildStore((s) => s.nodeOverrides);
  const allocMode = useBuildStore((s) => s.allocMode);
  const nodeModes = useBuildStore((s) => s.nodeModes);
  const allocate = useBuildStore((s) => s.allocate);
  const deallocate = useBuildStore((s) => s.deallocate);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const renderer = new TreeRenderer(tree);
    const interaction = new TreeInteraction(tree.nodes);
    const s0 = useBuildStore.getState();
    const ascName0 = s0.ascendancyId > 0 ? ascendanciesFor(s0.classId)[s0.ascendancyId - 1] ?? null : null;
    interaction.setActiveAnchors({
      classStartId: s0.classStartId,
      ascendStartId: s0.ascendStartId,
      ascendancyName: ascName0,
    });
    renderer.onNodeHover = setHovered;
    renderer.onProgress = (pct, label) => {
      if (!cancelled) setLoading({ pct, label });
    };
    renderer.onReady = () => {
      if (!cancelled) setLoading(null);
    };
    renderer.onNodeClick = async (id) => {
      const i = interactionRef.current;
      if (!i) return;
      const s = useBuildStore.getState();
      const clickedNode = tree.nodes[String(id)];
      // Ascendancy root nodes (where `name === ascendancyName`) act as class
      // pickers in PoB: clicking them selects that ascendancy — and the class
      // that owns it — rather than trying to allocate the node. Intercept
      // here before pathing/allocation runs.
      if (
        clickedNode?.ascendancyName &&
        typeof clickedNode.name === "string" &&
        clickedNode.name === clickedNode.ascendancyName
      ) {
        await handleAscendancyCoreClick(
          tree,
          clickedNode.ascendancyName,
          (msg, kind) => import("../ui/dialogStore").then(({ useDialogStore }) =>
            useDialogStore.getState().pushToast(msg, kind),
          ),
        );
        return;
      }
      if (s.allocated.has(id)) {
        const orphans = i.orphansOnRemove(s.allocated, id);
        deallocate(id);
        for (const orphanId of orphans) deallocate(orphanId);
        return;
      }
      const path = i.nodesToAllocate(s.allocated, id);
      const { useDialogStore } = await import("../ui/dialogStore");
      if (path.length === 0) {
        useDialogStore.getState().pushToast(`No path to node ${id} from your allocation.`, "error");
        return;
      }
      const current = computePoints({
        allocated: s.allocated,
        nodeModes: s.nodeModes,
        classStartId: s.classStartId,
        ascendStartId: s.ascendStartId,
      });
      const check = checkAllocation(current, path, s.allocMode);
      if (!check.ok) {
        useDialogStore.getState().pushToast(check.reason, "error");
        return;
      }
      // Any multi-option nodes newly in the path need a choice before we
      // commit. All the attribute nodes share the same 3 options (Str/Dex/Int)
      // so we collect them into ONE prompt and apply the user's pick to every
      // matching node in the path — avoiding a dialog-per-node mash.
      const needsChoice: number[] = [];
      for (const nid of path) {
        const n = tree.nodes[String(nid)];
        if (n?.options && n.options.length > 0 && s.nodeOverrides[nid] === undefined) {
          needsChoice.push(nid);
        }
      }
      const picks: Record<number, number> = {};
      if (needsChoice.length > 0) {
        // Use the first node's options as the canonical choice set. In practice
        // every "+5 to any Attribute" uses the same Str/Dex/Int trio so they
        // share a choice; if a path ever contained heterogeneous multi-option
        // nodes (none exist today), this fallback would still apply the same
        // index and the frontend would silently pick option[idx] on each.
        const first = tree.nodes[String(needsChoice[0])]!;
        const options = (first.options ?? []).map((o) => ({
          label: o.name,
          description: Array.isArray(o.stats) ? o.stats.join(" · ") : undefined,
        }));
        const title = needsChoice.length === 1
          ? (first.name ? `${first.name}: Choose Option` : "Choose Option")
          : `Choose Option (applies to ${needsChoice.length} nodes)`;
        const chosen = await useDialogStore.getState().openChoice(title, options);
        if (chosen == null) return; // cancelled — abort the whole allocation
        for (const nid of needsChoice) picks[nid] = chosen;
      }
      const setOverride = useBuildStore.getState().setNodeOverride;
      for (const [nidStr, idx] of Object.entries(picks)) setOverride(Number(nidStr), idx);
      allocate(path);
    };
    renderer.init(canvas).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      interactionRef.current = interaction;
      // Apply any existing overrides (from a build import that resolved before
      // init) now that atlas textures are available.
      renderer.applyOverrideIcons(useBuildStore.getState().nodeOverrides);
      // Initial class/ascendancy background pass — effect-driven updates kick
      // in afterwards but we need this first draw once textures are loaded.
      const s0b = useBuildStore.getState();
      void renderer.applyBackgrounds({
        classId: s0b.classId,
        ascendancyId: s0b.ascendancyId,
        classStartId: s0b.classStartId,
      });
      // Initial jewel-radius + icon draw in case a build was already loaded
      // before the renderer finished initialising. Uses the same iconUrl
      // lookup as the effect below.
      const s0i = useItemsStore.getState();
      const resolveIcon = (itemId: number): string | undefined => {
        const it = s0i.items.find((i) => i.id === itemId);
        if (!it) return undefined;
        if ((it.rarity === "UNIQUE" || it.rarity === "RELIC") && s0i.uniqueIcons[it.name]) {
          return `/items/${s0i.uniqueIcons[it.name]!.file}`;
        }
        const base = s0i.icons[it.baseType];
        return base ? `/items/${base.file}` : undefined;
      };
      void renderer.applyJewels(
        s0i.jewelSockets.length > 0
          ? s0i.jewelSockets.map((s) => ({
              nodeId: s.nodeId, radius: s.outerRadius ?? 0,
              iconUrl: resolveIcon(s.itemId),
            }))
          : Object.entries(s0i.treeSockets).map(([nodeId, itemId]) => ({
              nodeId: Number(nodeId),
              iconUrl: resolveIcon(Number(itemId)),
            })),
      );
    }).catch((err) => {
      console.error("TreeRenderer init failed", err);
    });
    return () => {
      cancelled = true;
      if (rendererRef.current === renderer) {
        renderer.destroy();
        rendererRef.current = null;
        interactionRef.current = null;
      }
    };
  }, [tree, allocate, deallocate]);

  useEffect(() => {
    const i = interactionRef.current;
    if (!i) return;
    const ascName = ascendancyId > 0 ? ascendanciesFor(classId)[ascendancyId - 1] ?? null : null;
    i.setActiveAnchors({ classStartId, ascendStartId, ascendancyName: ascName });
    const r = rendererRef.current;
    if (r) {
      void r.applyBackgrounds({ classId, ascendancyId, classStartId });
    }
  }, [classStartId, classId, ascendStartId, ascendancyId, tree]);

  // Swap icon textures for overridden multi-option nodes (attribute picks).
  // Fires after init + whenever the user's selections change. No-op before the
  // renderer has finished loading atlases.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.applyOverrideIcons(nodeOverrides);
  }, [nodeOverrides]);

  // Jewel sockets with equipped jewels: subscribe to the items store and
  // redraw the jewel layer (per-jewel radius + glow + gem icon) whenever
  // the sidecar provides fresh socket info or the XML is re-parsed.
  const treeSockets = useItemsStore((s) => s.treeSockets);
  const itemSets = useItemsStore((s) => s.itemSets);
  const activeItemSet = useItemsStore((s) => s.activeItemSet);
  const jewelSockets = useItemsStore((s) => s.jewelSockets);
  const allItems = useItemsStore((s) => s.items);
  const icons = useItemsStore((s) => s.icons);
  const uniqueIcons = useItemsStore((s) => s.uniqueIcons);

  // Look up the right webp url for a given socketed jewel item id. Uniques
  // prefer their own distinct art; other rarities use the base-type icon.
  const jewelIconUrl = (itemId: number): string | undefined => {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return undefined;
    if ((item.rarity === "UNIQUE" || item.rarity === "RELIC") && uniqueIcons[item.name]) {
      return `/items/${uniqueIcons[item.name]!.file}`;
    }
    const base = icons[item.baseType];
    return base ? `/items/${base.file}` : undefined;
  };

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (jewelSockets.length > 0) {
      void r.applyJewels(
        jewelSockets.map((s) => ({
          nodeId: s.nodeId,
          radius: s.outerRadius ?? 0,
          iconUrl: jewelIconUrl(s.itemId),
        })),
      );
      return;
    }
    // Fallback before sidecar info arrives: draw default rings + look up
    // the jewel item via the treeSockets mapping for the icon.
    const primary = Object.entries(treeSockets);
    if (primary.length > 0) {
      void r.applyJewels(
        primary.map(([nodeId, itemId]) => ({
          nodeId: Number(nodeId),
          iconUrl: jewelIconUrl(Number(itemId)),
        })),
      );
      return;
    }
    const set = itemSets.find((s) => s.id === activeItemSet) ?? itemSets[0];
    void r.applyJewels(
      set ? Object.keys(set.socketedJewels).map((k) => ({ nodeId: Number(k) })) : [],
    );
  }, [jewelSockets, treeSockets, itemSets, activeItemSet, allItems, icons, uniqueIcons]);

  useEffect(() => {
    const r = rendererRef.current;
    const i = interactionRef.current;
    if (!r || !i) return;
    const pathing = i.computePathing(allocated, hovered);
    const pathingEdges = i.pathingEdges(allocated, hovered);
    let removing: Set<NodeId> = new Set();
    if (hovered != null && allocated.has(hovered)) {
      removing = i.orphansOnRemove(allocated, hovered);
      removing.add(hovered);
    }
    r.applyAllocations(allocated, pathing, hovered, removing, pathingEdges, allocMode, nodeModes);
  }, [allocated, hovered, allocMode, nodeModes]);

  const pendingFocus = useFocusStore((s) => s.pendingFocus);
  const clearFocus = useFocusStore((s) => s.clear);
  useEffect(() => {
    if (pendingFocus == null) return;
    const r = rendererRef.current;
    if (!r) return;
    r.focusNode(pendingFocus);
    clearFocus();
  }, [pendingFocus, clearFocus]);

  const hoveredNode = hovered != null ? tree.nodes[String(hovered)] : null;
  // If the hovered node is a jewel socket with a jewel attached, look up
  // the parsed item so we can render its ItemTooltip alongside the node
  // tooltip. Falls back to ItemSet SocketIdURL mapping if the primary
  // <Sockets> block isn't present (rare older exports).
  const hoveredJewel = useMemo(() => {
    if (hovered == null) return undefined;
    const itemId = treeSockets[hovered];
    if (itemId == null) return undefined;
    return allItems.find((i) => i.id === itemId);
  }, [hovered, treeSockets, allItems]);

  // Reverse index: for each allocated tree node that falls inside a jewel
  // socket's radius, collect which jewels affect it + each jewel's mod
  // text. Used by NodeTooltip to show "From <jewel>: ..." blocks.
  const jewelEffectsByNode = useMemo(() => {
    const out = new Map<number, Array<{ jewelName: string; mods: string[] }>>();
    for (const socket of jewelSockets) {
      if (!socket.nodesInRadius || socket.nodesInRadius.length === 0) continue;
      const jewel = allItems.find((i) => i.id === socket.itemId);
      if (!jewel) continue;
      const mods = [
        ...jewel.implicits.map((m) => m.text),
        ...jewel.explicits.map((m) => m.text),
      ];
      if (mods.length === 0) continue;
      const jewelName = socket.itemName ?? jewel.name;
      for (const nid of socket.nodesInRadius) {
        const list = out.get(nid) ?? [];
        list.push({ jewelName, mods });
        out.set(nid, list);
      }
    }
    return out;
  }, [jewelSockets, allItems]);

  const hoveredJewelAffects = hovered != null ? jewelEffectsByNode.get(hovered) : undefined;

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onPointerMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      onPointerLeave={() => setCursor(null)}
    >
      <canvas ref={canvasRef} className={`block h-full w-full ${loading ? "invisible" : ""}`} />
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950">
          <div className="font-mono text-xs uppercase tracking-widest text-zinc-500">{loading.label}</div>
          <div className="h-1 w-64 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-zinc-300 transition-[width] duration-100 ease-out"
              style={{ width: `${Math.max(4, Math.round(loading.pct * 100))}%` }}
            />
          </div>
        </div>
      )}
      {!loading && hoveredNode && cursor && (
        <>
          <NodeTooltip
            node={hoveredNode}
            x={cursor.x}
            y={cursor.y}
            overrideIndex={hovered != null ? nodeOverrides[hovered] : undefined}
            jewelAffects={hoveredJewelAffects}
          />
          {hoveredJewel && <ItemTooltip item={hoveredJewel} x={cursor.x + 260} y={cursor.y} />}
        </>
      )}
    </div>
  );
}

// Handle a click on an ascendancy root node ("Oracle", "Deadeye", etc.). If
// the clicked ascendancy belongs to the current class we just swap the
// ascendancy; otherwise we prompt the user to either Reset & Swap (clears the
// tree and switches class) or Connect Path (keeps existing allocations and
// auto-paths from the new class start through the main tree).
async function handleAscendancyCoreClick(
  tree: PassiveTree,
  ascendancyName: string,
  toast: (msg: string, kind?: "info" | "error" | "success") => Promise<unknown> | unknown,
) {
  const classes = tree.classes ?? [];
  let targetClassId = -1;
  let targetAscendancyId = -1;
  for (let ci = 0; ci < classes.length; ci++) {
    const klass = classes[ci]!;
    const idx = (klass.ascendancies ?? []).findIndex((a) => a.name === ascendancyName);
    if (idx >= 0) { targetClassId = ci; targetAscendancyId = idx + 1; break; }
  }
  if (targetClassId === -1) return;

  const state = useBuildStore.getState();
  if (targetClassId === state.classId) {
    if (state.ascendancyId !== targetAscendancyId) {
      useBuildStore.getState().setAscendancy(targetAscendancyId);
    }
    return;
  }

  const userAllocCount = countUserAllocated(state);
  if (userAllocCount === 0) {
    useBuildStore.getState().swapClass(targetClassId, targetAscendancyId);
    return;
  }

  const newClassName = classes[targetClassId]?.name ?? "class";
  const { useDialogStore } = await import("../ui/dialogStore");
  const chosen = await useDialogStore.getState().openChoice(
    `Change class to ${newClassName}?`,
    [
      {
        label: "Reset & Swap",
        description: `Clears your passive tree and switches to ${newClassName}.`,
      },
      {
        label: "Connect Path",
        description: `Keeps your tree and auto-paths from the new ${newClassName} start.`,
      },
    ],
  );
  if (chosen == null) return;

  if (chosen === 0) {
    useBuildStore.getState().swapClass(targetClassId, targetAscendancyId);
    return;
  }

  // Connect Path — find shortest route from any currently allocated node to
  // the new class's start node, respecting forbidden categories.
  const newClassStart = classStartIdFor(targetClassId);
  if (newClassStart == null) {
    void toast("Cannot find start node for target class.", "error");
    return;
  }

  const forbidden = new Set<NodeId>();
  for (const [idStr, n] of Object.entries(tree.nodes)) {
    const id = Number(idStr);
    const nn = n as unknown as {
      isProxy?: boolean; isOnlyImage?: boolean; classesStart?: unknown[];
      ascendancyName?: string;
    };
    if (nn.isProxy || nn.isOnlyImage) forbidden.add(id);
    if (Array.isArray(nn.classesStart) && id !== newClassStart) forbidden.add(id);
    if (typeof nn.ascendancyName === "string" && nn.ascendancyName !== ascendancyName) {
      forbidden.add(id);
    }
  }

  const fromSet = new Set<NodeId>(state.allocated);
  if (state.classStartId != null) fromSet.delete(state.classStartId);
  if (state.ascendStartId != null) fromSet.delete(state.ascendStartId);
  if (fromSet.size === 0) {
    useBuildStore.getState().swapClass(targetClassId, targetAscendancyId);
    return;
  }

  const graph = buildGraph(tree.nodes);
  const path = shortestPath(fromSet, newClassStart, graph, forbidden);
  if (!path) {
    void toast(
      `No path to ${newClassName}'s start from your current tree — reset instead or try a different class.`,
      "error",
    );
    return;
  }

  // The connect path may include "+5 to any Attribute" nodes — prompt once
  // and apply the pick to all of them so swapping doesn't silently leave
  // them in their generic state. Same pattern as regular allocation flow.
  const needsChoice: number[] = [];
  for (const nid of path) {
    const n = tree.nodes[String(nid)];
    if (n?.options && n.options.length > 0 && state.nodeOverrides[nid] === undefined) {
      needsChoice.push(nid);
    }
  }
  if (needsChoice.length > 0) {
    const first = tree.nodes[String(needsChoice[0])]!;
    const options = (first.options ?? []).map((o) => ({
      label: o.name,
      description: Array.isArray(o.stats) ? o.stats.join(" · ") : undefined,
    }));
    const title = needsChoice.length === 1
      ? (first.name ? `${first.name}: Choose Option` : "Choose Option")
      : `Choose Option (applies to ${needsChoice.length} nodes in connect path)`;
    const chosen = await useDialogStore.getState().openChoice(title, options);
    if (chosen == null) return; // cancelled — abort the swap
    const setOverride = useBuildStore.getState().setNodeOverride;
    for (const nid of needsChoice) setOverride(nid, chosen);
  }

  useBuildStore.getState().swapClass(targetClassId, targetAscendancyId, path);
  void toast(
    `Swapped to ${newClassName} via ${path.length} connecting node${path.length === 1 ? "" : "s"}.`,
    "success",
  );
}
