import { useMemo, useState } from "react";
import { useItemsStore } from "./itemsStore";
import type { ParsedItem, SlotName } from "./xmlImport";
import { ItemTooltip } from "./ItemTooltip";
import { TextTooltip } from "../ui/TextTooltip";
import { useBuildStore } from "../build/buildStore";
import { ascendanciesFor } from "../build/classStarts";

// PoB/PoE2 slot names as emitted in the imported XML. The grid below places
// each slot on a fixed cell; a second item set (weapon swap) is rendered
// separately when the build uses one.
type SlotKey =
  | "Weapon 1" | "Weapon 2"
  | "Helmet" | "Body Armour" | "Gloves" | "Boots"
  | "Amulet" | "Ring 1" | "Ring 2" | "Belt"
  | "Flask 1" | "Flask 2"
  | "Charm 1" | "Charm 2" | "Charm 3";

const SLOT_LABEL: Record<SlotKey, string> = {
  "Weapon 1": "Weapon",
  "Weapon 2": "Off-hand",
  "Helmet": "Helmet",
  "Body Armour": "Body",
  "Gloves": "Gloves",
  "Boots": "Boots",
  "Amulet": "Amulet",
  "Ring 1": "Ring 1",
  "Ring 2": "Ring 2",
  "Belt": "Belt",
  "Flask 1": "Flask 1",
  "Flask 2": "Flask 2",
  "Charm 1": "Charm 1",
  "Charm 2": "Charm 2",
  "Charm 3": "Charm 3",
};

// Grid layout in CSS Grid coordinates (col / row start/end). 8 cols × 9 rows.
// Weapons occupy two tall stacks at the far left + right. The centre column
// stacks helmet → body, with amulet to body's left and rings stacked to body's
// right. Belt sits centred below body, with gloves / boots flanking. The
// bottom row has flasks on the outer sides and charms in the middle.
// Matches the PoE2 inventory shape.
const SLOT_CELL: Record<SlotKey, string> = {
  "Weapon 1":    "col-start-1 col-end-3 row-start-1 row-end-6",
  "Helmet":      "col-start-3 col-end-7 row-start-1 row-end-3",
  "Amulet":      "col-start-3 col-end-4 row-start-3 row-end-5",
  "Body Armour": "col-start-4 col-end-6 row-start-3 row-end-6",
  "Ring 1":      "col-start-6 col-end-7 row-start-3 row-end-4",
  "Ring 2":      "col-start-6 col-end-7 row-start-4 row-end-5",
  "Weapon 2":    "col-start-7 col-end-9 row-start-1 row-end-6",
  "Gloves":      "col-start-1 col-end-3 row-start-6 row-end-8",
  "Belt":        "col-start-4 col-end-6 row-start-7 row-end-8",
  "Boots":       "col-start-7 col-end-9 row-start-6 row-end-8",
  // Flasks hug the outer columns; charms sit in the middle 3-col band
  // (col 4-6) so they read as a centered cluster between the flasks.
  "Flask 1":     "col-start-1 col-end-3 row-start-8 row-end-9",
  "Charm 1":     "col-start-4 col-end-5 row-start-8 row-end-9",
  "Charm 2":     "col-start-5 col-end-6 row-start-8 row-end-9",
  "Charm 3":     "col-start-6 col-end-7 row-start-8 row-end-9",
  "Flask 2":     "col-start-7 col-end-9 row-start-8 row-end-9",
};

// Charms are not in this list because they're drawn inside a single wrapper
// grid cell spanning the centre 4 cols so they can be flex-centred as a
// cluster between the two flasks. Their individual positions are handled in
// the render path separately.
const ALL_SLOTS: SlotKey[] = [
  "Weapon 1", "Weapon 2",
  "Helmet", "Body Armour", "Gloves", "Boots",
  "Amulet", "Ring 1", "Ring 2", "Belt",
  "Flask 1", "Flask 2",
];

const CHARM_SLOTS: SlotKey[] = ["Charm 1", "Charm 2", "Charm 3"];

export function ItemsPanel() {
  const items = useItemsStore((s) => s.items);
  const itemSets = useItemsStore((s) => s.itemSets);
  const activeItemSet = useItemsStore((s) => s.activeItemSet);
  const icons = useItemsStore((s) => s.icons);
  const uniqueIcons = useItemsStore((s) => s.uniqueIcons);
  const classId = useBuildStore((s) => s.classId);
  const ascendancyId = useBuildStore((s) => s.ascendancyId);
  const [weaponSet, setWeaponSet] = useState<1 | 2>(1);

  // Shaman is the Druid's Shaman ascendancy — only class that benefits from
  // `Bonded:` rune enchants. We surface this as a flag so the tooltip can
  // render those runes in purple (active) vs dimmed (inactive for others).
  const isShaman = useMemo(() => {
    const ascNames = ascendanciesFor(classId);
    return ascendancyId > 0 && ascNames[ascendancyId - 1] === "Shaman";
  }, [classId, ascendancyId]);

  // Resolve the right icon filename for a given item. Uniques / relics prefer
  // their own distinct art (e.g. Headhunter has its own belt model, separate
  // from Leather Belt). Normal/magic/rare items fall back to the base-type
  // icon which matches the item's appearance in-game.
  const iconFor = (item: ParsedItem | undefined): string | undefined => {
    if (!item) return undefined;
    if ((item.rarity === "UNIQUE" || item.rarity === "RELIC") && uniqueIcons[item.name]) {
      return uniqueIcons[item.name]!.file;
    }
    return icons[item.baseType]?.file;
  };

  // Resolve socketable (rune / soul core) base-name to its webp filename.
  // These share the same manifest as regular gear since they're proper base
  // items themselves.
  const socketableIcon = (name: string): string | undefined =>
    icons[name]?.file;

  const activeSet = useMemo(
    () => itemSets.find((s) => s.id === activeItemSet) ?? itemSets[0],
    [itemSets, activeItemSet],
  );

  // Map slot name → actual item, considering weapon-swap selection. XML stores
  // swap slots as "Weapon 1 Swap" / "Weapon 2 Swap" when activated. We iterate
  // the gear slots AND the charm slots together — charms live in their own
  // flex wrapper in the render, but their data comes from the same `ItemSet`
  // slot map and needs the same lookup treatment.
  const slotItem = useMemo(() => {
    const out: Record<string, ParsedItem | undefined> = {};
    if (!activeSet) return out;
    for (const slotKey of [...ALL_SLOTS, ...CHARM_SLOTS]) {
      const xmlSlotName =
        weaponSet === 2 && (slotKey === "Weapon 1" || slotKey === "Weapon 2")
          ? (`${slotKey} Swap` as SlotName)
          : (slotKey as SlotName);
      const itemId = activeSet.slots[xmlSlotName] ?? activeSet.slots[slotKey];
      if (!itemId) continue;
      out[slotKey] = items.find((i) => i.id === itemId);
    }
    return out;
  }, [activeSet, items, weaponSet]);

  if (items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-fg-muted font-mono text-xs">
        Import a build to see its gear.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto p-6">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
        <span className="text-fg-muted">Weapon Set</span>
        <button
          type="button"
          onClick={() => setWeaponSet(1)}
          className={`rounded-sm px-2 py-0.5 ${
            weaponSet === 1 ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg"
          }`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => setWeaponSet(2)}
          className={`rounded-sm px-2 py-0.5 ${
            weaponSet === 2 ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg"
          }`}
        >
          II
        </button>
      </div>

      {/* 6-col gear grid, rows auto-sized by content. Cells span multiple rows
          for double-tall weapons / armour. */}
      <div className="grid grid-cols-8 gap-2 max-w-3xl" style={{ gridAutoRows: "minmax(80px, auto)" }}>
        {ALL_SLOTS.map((slotKey) => {
          const item = slotItem[slotKey];
          return (
            <GearSlot
              key={slotKey}
              slotKey={slotKey}
              className={SLOT_CELL[slotKey]}
              item={item}
              iconFile={iconFor(item)}
              isShaman={isShaman}
              socketableIcon={socketableIcon}
            />
          );
        })}
        {/* Charms cluster: single wrapper cell spans the full gap between
            flask 1 (cols 1-2) and flask 2 (cols 7-8), and uses flex to
            centre the three charm tiles — 3 cells can't be symmetrically
            placed inside a 4-col gap via grid positioning alone. Each
            charm is a full-height (h-full) grid-slot styled tile so it
            reads as "in a slot" rather than a free-floating tile. */}
        <div className="col-start-3 col-end-7 row-start-8 row-end-9 flex justify-center items-stretch gap-2">
          {CHARM_SLOTS.map((slotKey) => {
            const item = slotItem[slotKey];
            return (
              <GearSlot
                key={slotKey}
                slotKey={slotKey}
                className="h-full aspect-square min-w-[80px]"
                item={item}
                iconFile={iconFor(item)}
                isShaman={isShaman}
                socketableIcon={socketableIcon}
              />
            );
          })}
        </div>
      </div>

      {/* Jewels section. Jewels live in the <Items> block like any other
          item but aren't tied to a gear slot — they socket into the passive
          tree via <SocketIdURL> entries we don't wire into the tree yet.
          For now, surface every jewel the build carries so you can at least
          see what's included. */}
      {(() => {
        const jewels = items.filter((it) => it.itemClass === "Jewel");
        if (jewels.length === 0) return null;
        return (
          <div className="mt-6 max-w-3xl">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              Jewels ({jewels.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {jewels.map((jewel) => (
                <GearSlot
                  key={jewel.id}
                  slotKey={"Jewel" as SlotKey}
                  className="w-24 h-24"
                  item={jewel}
                  iconFile={iconFor(jewel)}
                  isShaman={isShaman}
                  socketableIcon={socketableIcon}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function GearSlot({
  slotKey,
  className,
  item,
  iconFile,
  isShaman,
  socketableIcon,
}: {
  slotKey: SlotKey;
  className: string;
  item: ParsedItem | undefined;
  iconFile?: string;
  isShaman: boolean;
  /** Look up a socketable base-name to its webp file for overlay. */
  socketableIcon: (name: string) => string | undefined;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [socketHover, setSocketHover] = useState(false);
  return (
    <div
      className={`relative rounded-sm border border-border bg-bg-elev/60 ${className}`}
      onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
    >
      {!item && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] uppercase tracking-widest text-fg-dim">
          {SLOT_LABEL[slotKey]}
        </div>
      )}
      {item && (
        <>
          {iconFile ? (
            <img
              src={`/items/${iconFile}`}
              alt={item.name}
              className="absolute inset-0 m-auto max-w-full max-h-full object-contain p-1 drop-shadow"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-fg">
              {item.baseType}
            </div>
          )}
          {/* Socketables overlay: small grid of rune/soul-core icons anchored
              to the top-right of the tile. Lays out horizontally for up to
              3 sockets, wraps for more. Each socketable is a small circular
              icon on a glass background so it reads against any gear art. */}
          {item.socketables.length > 0 && (
            <div className="absolute top-1 right-1 flex flex-wrap-reverse justify-end gap-0.5 max-w-[70%]">
              {item.socketables.map((name, i) => (
                <SocketableIcon
                  key={i}
                  name={name}
                  file={socketableIcon(name)}
                  onHoverChange={setSocketHover}
                />
              ))}
            </div>
          )}
          {/* Glassy text plate so the name / base type stay readable against
              any underlying icon art. */}
          <div className="absolute bottom-0 left-0 right-0 bg-bg/60 backdrop-blur-sm px-1 pb-0.5 pt-0.5 text-center">
            <div className={`truncate font-mono text-[9px] ${rarityText(item.rarity)}`}>
              {item.name}
            </div>
            {/* Base type line — only on gear (weapons/armour/jewelry). Flasks
                and charms have distinctive art and a single identity line is
                enough; doubling up just crowds those tiny tiles. */}
            {shouldShowBaseType(slotKey) && item.baseType && item.baseType !== item.name && (
              <div className="truncate font-mono text-[8px] text-fg-dim">
                {item.baseType}
              </div>
            )}
          </div>
        </>
      )}
      {item && hover && !socketHover && <ItemTooltip item={item} x={hover.x} y={hover.y} isShaman={isShaman} />}
    </div>
  );
}

// Rarity colours mirror PoE2's in-game palette so rare vs unique reads at a
// glance on the slot label: rare = pale yellow, unique = warm orange, relic =
// purple, magic = cyan-blue, normal = muted grey.
// Flasks / charms have distinctive in-game art and their "base type" repeats
// the name redundantly (e.g. "Ruby Flask" / "Ruby Flask"). Skip the extra
// line for them; everything else benefits from the hint ("Headhunter /
// Leather Belt").
function shouldShowBaseType(slotKey: string): boolean {
  return !slotKey.startsWith("Flask") && !slotKey.startsWith("Charm");
}

function rarityText(rarity: ParsedItem["rarity"]): string {
  switch (rarity) {
    case "RARE": return "text-yellow-200";
    case "UNIQUE": return "text-orange-400";
    case "RELIC": return "text-purple-400";
    case "MAGIC": return "text-sky-300";
    default: return "text-fg-muted";
  }
}

function SocketableIcon({
  name,
  file,
  onHoverChange,
}: {
  name: string;
  file: string | undefined;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <div
        onMouseEnter={(e) => { setHover({ x: e.clientX, y: e.clientY }); onHoverChange?.(true); }}
        onMouseLeave={() => { setHover(null); onHoverChange?.(false); }}
        className="h-4 w-4 rounded-full bg-bg/60 backdrop-blur-sm ring-1 ring-border/60 overflow-hidden"
      >
        {file ? (
          <img src={`/items/${file}`} alt={name} className="h-full w-full object-contain" />
        ) : null}
      </div>
      {hover && (
        <TextTooltip
          text={name}
          x={hover.x}
          y={hover.y}
          iconSrc={file ? `/items/${file}` : undefined}
        />
      )}
    </>
  );
}
