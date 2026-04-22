import { XMLParser } from "fast-xml-parser";

export type ItemRarity = "NORMAL" | "MAGIC" | "RARE" | "UNIQUE" | "RELIC";

export interface ItemRequirement {
  level?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
}

export interface ItemProperty {
  key: string;   // e.g. "Armour", "Evasion Rating", "Physical Damage"
  value: string; // raw string — keeps ranges ("82-125") intact for display
}

export interface ItemModLine {
  /** Mod text with any {fractured}/{desecrated}/{enchant}/{rune}/{mutated}
   *  prefix stripped off — ready to display verbatim. */
  text: string;
  /** True when the raw line was tagged `{fractured}` — unchangeable mod on
   *  the item's base roll. Displayed in yellow/gold in-game. */
  fractured?: boolean;
  /** True when the raw line was tagged `{desecrated}` — necropolis-style
   *  mod that displays with a green tint. */
  desecrated?: boolean;
  /** True when the raw line was tagged `{mutated}` — result of corruption,
   *  displayed in red. */
  mutated?: boolean;
  /** Rune mod whose text starts with "Bonded:" — only active for the Druid's
   *  Shaman ascendancy; other classes can't remove them. */
  bonded?: boolean;
}

export interface ParsedItem {
  /** XML-internal item id (matches <Slot itemId=…>). */
  id: number;
  rarity: ItemRarity;
  /** Item display name — equal to baseType for normal/magic items. */
  name: string;
  namePrefix?: string;
  nameSuffix?: string;
  /** The item's base type (e.g. "Vaal Mask", "Expert Lineage Bow"). */
  baseType: string;
  /** Item class / slot category, resolved later via the base-type registry. */
  itemClass?: string;
  properties: ItemProperty[];
  requirements: ItemRequirement;
  /** Implicit mod text lines. */
  implicits: ItemModLine[];
  /** Enchant / rune mod lines — socketed into the item at runtime; shown
   *  above implicits in tooltips as their own block. */
  runes: ItemModLine[];
  /** Explicit mod text lines — may carry fractured/desecrated flags. */
  explicits: ItemModLine[];
  /** PoB's "Corrupted" marker. */
  corrupted?: boolean;
  /** Names of runes / soul cores socketed into the item (one per `Rune:`
   *  metadata line that wasn't "None"). Looked up in the icon manifest
   *  by the ItemsPanel to overlay socketable art on the gear tile. */
  socketables: string[];
  /** Raw item text as shipped by PoB, kept for round-tripping / debug. */
  raw: string;
}

export type SlotName =
  | "Weapon 1" | "Weapon 2" | "Weapon 1 Swap" | "Weapon 2 Swap"
  | "Helmet" | "Body Armour" | "Gloves" | "Boots"
  | "Amulet" | "Ring 1" | "Ring 2" | "Belt"
  | "Flask 1" | "Flask 2" | "Flask 3" | "Flask 4" | "Flask 5"
  | "Charm 1" | "Charm 2" | "Charm 3"
  | (string & {});

export interface ItemSet {
  id: number;
  title: string;
  useSecondWeaponSet: boolean;
  /** Map of slot name → itemId (references ParsedItem.id). */
  slots: Record<SlotName, number>;
  /** Tree-socketed jewels: passive-node id → jewel info. PoB emits these
   *  as <SocketIdURL nodeId="N" itemPbURL="..." /> rather than regular
   *  <Slot> entries because the jewel's data is URL-encoded rather than
   *  referencing an <Item> by id. We keep both the URL (for future
   *  decoding) and the slot name here. */
  socketedJewels: Record<number, { name?: string; itemPbURL?: string }>;
}

export interface ParsedItems {
  activeItemSet: number;
  useSecondWeaponSet: boolean;
  items: ParsedItem[];
  itemSets: ItemSet[];
  /** Tree passive-node id → jewel item id. Parsed from
   *  <Tree><Spec active><Sockets><Socket nodeId itemId/></Sockets></Spec>.
   *  Items referenced here are regular <Item> entries in `items[]`. */
  treeSockets: Record<number, number>;
}

const RARITY_RE = /^Rarity:\s*(\w+)/i;
const IMPLICIT_SUFFIX = /\s*\(implicit\)$/i;
const ENCHANT_SUFFIX = /\s*\(enchant\)$/i;
const RUNE_SUFFIX = /\s*\(rune\)$/i;

// Tag prefix used by PoB to mark mod origin in its internal format. Multiple
// tags can stack (e.g. `{enchant}{rune}8% increased Movement Speed`); we
// consume them all and return the stripped text + the set of flags.
interface ModTags {
  enchant?: boolean; rune?: boolean; fractured?: boolean;
  desecrated?: boolean; crafted?: boolean; mutated?: boolean;
}

function stripModTags(line: string): { text: string; tags: ModTags } {
  const tags: ModTags = {};
  let s = line;
  while (true) {
    const m = s.match(/^\{([a-z]+)\}(.*)$/);
    if (!m) break;
    const tag = m[1]!;
    if (tag === "enchant") tags.enchant = true;
    else if (tag === "rune") tags.rune = true;
    else if (tag === "fractured") tags.fractured = true;
    else if (tag === "desecrated") tags.desecrated = true;
    else if (tag === "crafted") tags.crafted = true;
    else if (tag === "mutated") tags.mutated = true;
    s = m[2]!;
  }
  return { text: s, tags };
}

// Metadata keys emitted by PoB in its internal item format (see
// PathOfBuilding-PoE2/src/Classes/Item.lua ParseRaw). We use these to know
// when a line is structured metadata vs a mod text line.
const META_KEYS = new Set([
  "Crafted", "Prefix", "Suffix", "Quality", "Sockets", "Rune",
  "LevelReq", "ItemLevel", "Item Level", "Implicits", "Evasion", "Armour", "Energy Shield",
  "Requires", "Requires Class", "Requires Level",
  "Limited to", "Radius", "Charm Limit", "Socketable",
  "Unique ID", "Shaper Item", "Elder Item",
]);

function tryParseRequires(line: string, req: ItemRequirement): boolean {
  // PoB emits individual lines like "Requires Level 68" or "Requires 114 Int".
  // Game-clipboard format emits "Requires Level 68, 114 Int, 75 Str" on one line.
  const m1 = line.match(/^Requires\s+Level\s+(\d+)/i);
  if (m1) { req.level = Number(m1[1]); return true; }
  const m2 = line.match(/^Requires:?\s+(.+)$/i);
  if (m2) {
    const rest = m2[1]!;
    for (const part of rest.split(/,\s*/)) {
      const level = part.match(/Level\s+(\d+)/i);
      if (level) req.level = Number(level[1]);
      const str = part.match(/(\d+)\s*Str/i);
      if (str) req.strength = Number(str[1]);
      const dex = part.match(/(\d+)\s*Dex/i);
      if (dex) req.dexterity = Number(dex[1]);
      const intel = part.match(/(\d+)\s*Int/i);
      if (intel) req.intelligence = Number(intel[1]);
    }
    return true;
  }
  return false;
}

export function parseItemRaw(id: number, raw: string): ParsedItem {
  const item: ParsedItem = {
    id,
    rarity: "NORMAL",
    name: "?",
    baseType: "?",
    properties: [],
    requirements: {},
    implicits: [],
    runes: [],
    explicits: [],
    socketables: [],
    raw,
  };

  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length === 0) return item;

  let i = 0;

  // Optional "Item Class:" prefix from game-clipboard exports.
  if (lines[i] && /^Item Class:/i.test(lines[i]!)) i++;

  // Rarity
  const rarityMatch = lines[i]?.match(RARITY_RE);
  if (rarityMatch) {
    const r = rarityMatch[1]!.toUpperCase();
    if (r === "NORMAL" || r === "MAGIC" || r === "RARE" || r === "UNIQUE" || r === "RELIC") {
      item.rarity = r;
    }
    i++;
  }

  // Name / BaseType: rare+ gets two lines, else just one (the base).
  if (item.rarity === "RARE" || item.rarity === "UNIQUE" || item.rarity === "RELIC") {
    item.name = lines[i++] ?? item.name;
    item.baseType = lines[i++] ?? item.name;
  } else if (item.rarity === "MAGIC" || item.rarity === "NORMAL") {
    item.name = lines[i++] ?? item.name;
    item.baseType = item.name;
  }

  // Walk remaining lines. PoB's internal format uses structured metadata
  // ("Quality: 20", "Sockets: S S S S", "LevelReq: 16", "Implicits: N", ...)
  // followed by the raw mod text — first N lines are implicits, then
  // everything else is explicits. Lines starting with "Implicits: N" switch
  // state to collect the next N lines as implicit mods.
  let implicitsRemaining = -1; // -1 until we see "Implicits: N" marker
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "--------") continue; // game-clipboard divider, ignored here

    // When we're inside the implicit-mods block, consume verbatim. Strip
    // tag prefixes so the stored text is human-readable. "Bonded:" lines —
    // the Druid-Shaman-only rune variant — always route to the runes block
    // even when PoB counted them under Implicits:, so the tooltip can
    // render them in purple / dimmed-strikethrough per class.
    if (implicitsRemaining > 0) {
      const stripped = stripModTags(line)
        .text.replace(IMPLICIT_SUFFIX, "")
        .replace(ENCHANT_SUFFIX, "")
        .replace(RUNE_SUFFIX, "")
        .trim();
      if (stripped.startsWith("Bonded:")) {
        item.runes.push({ text: stripped, bonded: true });
      } else {
        item.implicits.push({ text: stripped });
      }
      implicitsRemaining--;
      continue;
    }

    // Key: value metadata. Match before recognising mod text.
    const kv = line.match(/^([A-Za-z][A-Za-z ]*?):\s*(.+)$/);
    const key = kv?.[1]?.trim();
    const value = kv?.[2]?.trim();
    if (key && META_KEYS.has(key)) {
      if (key === "Implicits") {
        implicitsRemaining = Number(value) || 0;
      } else if (key === "Quality" || key === "LevelReq" || key === "ItemLevel" ||
                 key === "Item Level" ||
                 key === "Armour" || key === "Evasion" || key === "Energy Shield" ||
                 key === "Sockets") {
        // Normalise "Item Level" (game-clipboard format) → "ItemLevel" so the
        // tooltip's iLvl badge finds it in one place.
        const storeKey = key === "Item Level" ? "ItemLevel" : key;
        item.properties.push({ key: storeKey, value: value ?? "" });
        if (key === "LevelReq") item.requirements.level = Number(value) || undefined;
      } else if (key === "Rune" && value && value !== "None") {
        // PoB emits one `Rune: <name>` line per socket slot. "None" means
        // empty; anything else is a socketed rune or soul core we can
        // visually overlay on the item tile.
        item.socketables.push(value);
      }
      // Prefix/Suffix/Crafted are internal structural data — we skip them
      // for display. Their mod *text* appears later as implicits/explicits.
      continue;
    }

    // "Requires …" variants.
    if (tryParseRequires(line, item.requirements)) continue;

    // Game-clipboard style implicit/enchant suffix lines.
    if (IMPLICIT_SUFFIX.test(line) || ENCHANT_SUFFIX.test(line) || RUNE_SUFFIX.test(line)) {
      const stripped = line
        .replace(IMPLICIT_SUFFIX, "")
        .replace(ENCHANT_SUFFIX, "")
        .replace(RUNE_SUFFIX, "")
        .trim();
      item.implicits.push({ text: stripped });
      continue;
    }

    // Status tags PoB emits for corrupted / mirrored / sanctified etc.
    if (line === "Corrupted" || line === "Twice Corrupted") { item.corrupted = true; continue; }
    if (/^(Mirrored|Sanctified|Unidentified|Split|Desecrated (Prefix|Suffix))$/.test(line)) {
      continue;
    }

    // PoB tagged mod. `{enchant}{rune}` or `{rune}` → runes block; other
    // tags flag the explicit line for styling. Lines without a tag are
    // plain explicit mods — except for "Bonded:" prefixed lines which are
    // always Shaman-only runes regardless of whether PoB tagged them, so
    // we treat them as runes for colour-coding purposes.
    const { text, tags } = stripModTags(line);
    if (tags.enchant || tags.rune || text.startsWith("Bonded:")) {
      item.runes.push({
        text,
        ...(text.startsWith("Bonded:") ? { bonded: true } : {}),
      });
      continue;
    }
    item.explicits.push({
      text,
      ...(tags.fractured ? { fractured: true } : {}),
      ...(tags.desecrated ? { desecrated: true } : {}),
      ...(tags.mutated ? { mutated: true } : {}),
    });
  }

  return item;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  trimValues: false, // preserve item text
  // Ensure arrays for repeatable Item/Slot elements
  isArray: (name) =>
    name === "Item" || name === "ItemSet" || name === "Slot" ||
    name === "SocketIdURL" || name === "Spec" || name === "Socket",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function getItemText(itemEl: Record<string, unknown>): string {
  // Children of fast-xml-parser with trimValues=false keep whitespace — the
  // Item's text content shows up under "#text" or as its sole string value.
  const t = itemEl["#text"];
  if (typeof t === "string") return t;
  // Some exports pass item text as the only content under a stray string key.
  for (const v of Object.values(itemEl)) {
    if (typeof v === "string") return v;
  }
  return "";
}

export function parseItemsXml(xml: string): ParsedItems {
  const raw = parser.parse(xml);
  const root = raw.PathOfBuilding2 ?? raw.PathOfBuilding;
  const itemsNode = root?.Items ?? {};

  const itemEls = asArray(itemsNode.Item) as Array<Record<string, unknown>>;
  const items = itemEls.map((el) => {
    const id = Number((el["@_id"] as number | string) ?? 0);
    return parseItemRaw(id, getItemText(el));
  });

  const itemSets = asArray(itemsNode.ItemSet).map((setEl: Record<string, unknown>) => {
    const slots: Record<string, number> = {};
    for (const slot of asArray(setEl.Slot) as Array<Record<string, unknown>>) {
      const name = String(slot["@_name"] ?? "");
      const itemId = Number((slot["@_itemId"] as number | string) ?? 0);
      if (name) slots[name] = itemId;
    }
    const socketedJewels: Record<number, { name?: string; itemPbURL?: string }> = {};
    for (const socket of asArray(setEl.SocketIdURL) as Array<Record<string, unknown>>) {
      const nodeId = Number((socket["@_nodeId"] as number | string) ?? 0);
      if (!nodeId) continue;
      socketedJewels[nodeId] = {
        name: socket["@_name"] ? String(socket["@_name"]) : undefined,
        itemPbURL: socket["@_itemPbURL"] ? String(socket["@_itemPbURL"]) : undefined,
      };
    }
    return {
      id: Number((setEl["@_id"] as number | string) ?? 0),
      title: String(setEl["@_title"] ?? ""),
      useSecondWeaponSet: String(setEl["@_useSecondWeaponSet"] ?? "") === "true",
      slots,
      socketedJewels,
    };
  });

  // Tree-socketed jewels: parse <Tree><Spec active><Sockets><Socket
  // nodeId itemId/></Sockets>. The spec used is the one matching `activeSpec`
  // on the <Tree> element (1-based).
  const treeSockets: Record<number, number> = {};
  const treeNode = root?.Tree;
  if (treeNode) {
    const activeSpecIdx = Number(treeNode["@_activeSpec"] ?? 1);
    const specs = asArray(treeNode.Spec) as Array<Record<string, unknown>>;
    const activeSpec = specs[activeSpecIdx - 1] ?? specs[0];
    const socketsWrap = activeSpec?.Sockets as Record<string, unknown> | undefined;
    if (socketsWrap) {
      const socketEls = asArray(socketsWrap.Socket) as Array<Record<string, unknown>>;
      for (const sock of socketEls) {
        const nodeId = Number((sock["@_nodeId"] as number | string) ?? 0);
        const itemId = Number((sock["@_itemId"] as number | string) ?? 0);
        if (nodeId && itemId > 0) treeSockets[nodeId] = itemId;
      }
    }
  }

  return {
    activeItemSet: Number(itemsNode["@_activeItemSet"] ?? 1),
    useSecondWeaponSet: String(itemsNode["@_useSecondWeaponSet"] ?? "") === "true",
    items,
    itemSets,
    treeSockets,
  };
}
