import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { parseItemsXml, type ParsedItem, type ItemSet } from "./xmlImport";

export interface JewelSocketInfo {
  nodeId: number;
  itemId: number;
  itemName?: string;
  radiusIndex?: number;
  /** Radius in tree-world units (outer). 0/undefined means the jewel has
   *  no area-of-effect — don't draw a ring. */
  outerRadius?: number;
  /** For variable-radius / ring-shaped jewels: the inner radius below
   *  which the effect does NOT apply. Usually 0 for standard jewels. */
  innerRadius?: number;
  radiusLabel?: string;
  /** Allocated passive tree node ids that fall inside this jewel's
   *  radius (PoB's pre-computed `nodesInRadius` under the same index). */
  nodesInRadius: number[];
}

interface BaseEntry {
  type: string;
  implicit?: string;
  tags?: Record<string, boolean>;
  req?: { level?: number; strength?: number; dexterity?: number; intelligence?: number };
}

interface IconEntry {
  file: string;
}

interface ItemsState {
  items: ParsedItem[];
  itemSets: ItemSet[];
  activeItemSet: number;
  useSecondWeaponSet: boolean;
  /** Tree passive-node id → jewel item id (from <Tree><Spec><Sockets>). */
  treeSockets: Record<number, number>;
  /** Base-name → PoB base data (slot, implicit, requirements). */
  bases: Record<string, BaseEntry>;
  /** Base-name → icon file name in public/items/. */
  icons: Record<string, IconEntry>;
  /** Unique-name → unique-specific icon file (e.g. Headhunter has its own
   *  art distinct from the Leather Belt base). Checked first for UNIQUE
   *  rarity items before falling back to the base icon. */
  uniqueIcons: Record<string, IconEntry>;
  basesLoaded: boolean;
  iconsLoaded: boolean;
  /** Per-socket metadata populated by the sidecar after a build is loaded.
   *  Empty until `refreshJewelSockets` resolves. */
  jewelSockets: JewelSocketInfo[];
  loadXml: (xml: string | null) => void;
  loadBasesAndIcons: () => Promise<void>;
  refreshJewelSockets: () => Promise<void>;
  /** Helper: find the right item for a given slot in the active set. */
  getActiveItem: (slotName: string) => ParsedItem | undefined;
  /** Tree-node ids that have a jewel socketed in the active item set. The
   *  tree renderer uses this to draw the jewel's area-of-effect radius +
   *  marker at the node's position. */
  getSocketedJewelNodes: () => number[];
}

export const useItemsStore = create<ItemsState>((set, get) => ({
  items: [],
  itemSets: [],
  activeItemSet: 1,
  useSecondWeaponSet: false,
  treeSockets: {},
  bases: {},
  icons: {},
  uniqueIcons: {},
  basesLoaded: false,
  iconsLoaded: false,
  jewelSockets: [],

  loadXml: (xml) => {
    if (!xml) {
      set({ items: [], itemSets: [], activeItemSet: 1, useSecondWeaponSet: false, treeSockets: {} });
      return;
    }
    try {
      const parsed = parseItemsXml(xml);
      // Post-process each item: resolve itemClass from the base registry.
      const bases = get().bases;
      const withClasses = parsed.items.map((item) => {
        // Try the parsed baseType first. Magic items often have the base type
        // wrapped in prefix/suffix — we fall back to scanning for a registered
        // base embedded in the name.
        if (bases[item.baseType]) {
          return { ...item, itemClass: bases[item.baseType]!.type };
        }
        for (const baseName of Object.keys(bases)) {
          if (item.name.includes(baseName)) {
            return { ...item, itemClass: bases[baseName]!.type, baseType: baseName };
          }
        }
        return item;
      });
      set({
        items: withClasses,
        itemSets: parsed.itemSets,
        activeItemSet: parsed.activeItemSet,
        useSecondWeaponSet: parsed.useSecondWeaponSet,
        treeSockets: parsed.treeSockets,
      });
    } catch (e) {
      console.warn("parseItemsXml failed", e);
      set({ items: [], itemSets: [], activeItemSet: 1, useSecondWeaponSet: false, treeSockets: {} });
    }
  },

  loadBasesAndIcons: async () => {
    const state = get();
    if (state.basesLoaded && state.iconsLoaded) return;
    try {
      const [basesR, iconsR, uniquesR] = await Promise.all([
        fetch("/item-bases.json"),
        fetch("/item-icons-manifest.json"),
        fetch("/unique-icons-manifest.json"),
      ]);
      const bases: Record<string, BaseEntry> = basesR.ok ? await basesR.json() : {};
      const icons: Record<string, IconEntry> = iconsR.ok ? await iconsR.json() : {};
      const uniqueIcons: Record<string, IconEntry> = uniquesR.ok ? await uniquesR.json() : {};
      set({ bases, icons, uniqueIcons, basesLoaded: true, iconsLoaded: true });
    } catch (e) {
      console.warn("Failed to load item bases/icons", e);
      set({ basesLoaded: true, iconsLoaded: true });
    }
  },

  refreshJewelSockets: async () => {
    // Sidecar returns radii + which allocated nodes each jewel affects.
    // Safe to swallow errors here — jewels just won't get ring art / per-
    // node bonus hints if the build isn't loaded yet.
    try {
      const res = await invoke<{ sockets: JewelSocketInfo[] }>("lua_get_jewel_sockets");
      set({ jewelSockets: Array.isArray(res?.sockets) ? res.sockets : [] });
    } catch {
      set({ jewelSockets: [] });
    }
  },

  getActiveItem: (slotName) => {
    const { itemSets, items, activeItemSet } = get();
    const set = itemSets.find((s) => s.id === activeItemSet) ?? itemSets[0];
    if (!set) return undefined;
    const itemId = set.slots[slotName];
    if (itemId == null || itemId === 0) return undefined;
    return items.find((i) => i.id === itemId);
  },
  getSocketedJewelNodes: () => {
    // Prefer <Tree><Spec><Sockets> mapping (authoritative — references real
    // Item ids). Fall back to SocketIdURL in item-sets if treeSockets is
    // empty (some older XMLs only have the ItemSet-scoped one).
    const { treeSockets, itemSets, activeItemSet } = get();
    const treeKeys = Object.keys(treeSockets);
    if (treeKeys.length > 0) return treeKeys.map(Number);
    const set = itemSets.find((s) => s.id === activeItemSet) ?? itemSets[0];
    if (!set) return [];
    return Object.keys(set.socketedJewels).map(Number);
  },
}));
