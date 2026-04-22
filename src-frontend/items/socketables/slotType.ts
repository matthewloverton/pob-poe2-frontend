export type SlotKey =
  | "Weapon 1" | "Weapon 2"
  | "Helmet" | "Body Armour" | "Gloves" | "Boots"
  | "Amulet" | "Ring 1" | "Ring 2" | "Belt"
  | "Flask 1" | "Flask 2"
  | "Charm 1" | "Charm 2" | "Charm 3";

/** Map a frontend SlotKey to the slot-string PoB uses in ModRunes.lua
 *  (lowercase, spaces preserved, numeric suffixes dropped). */
export function slotTypeForKey(key: SlotKey): string {
  const base = key.replace(/\s*\d+$/, "").toLowerCase();
  return base;
}
