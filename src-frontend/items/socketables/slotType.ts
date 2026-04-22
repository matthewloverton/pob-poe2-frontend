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

// PoE2 caster-side weapon classes. Anything else is treated as a martial weapon.
const CASTER_CLASSES = new Set([
  "Wand", "Staff", "Sceptre", "Quarterstaff",
]);

/** Ordered list of ModRunes.lua slot keys to try when looking up a socketable.
 *  Soul Cores key by specific slot (helmet/body armour/focus/...); Runes usually
 *  key by broad category (weapon/caster/armour). We try the specific first and
 *  fall back to the category. For weapons we pick `weapon` vs `caster` based on
 *  the item's class when known. */
export function slotCandidatesFor(key: SlotKey, itemClass?: string): string[] {
  const specific = slotTypeForKey(key);
  if (key === "Helmet" || key === "Body Armour" || key === "Gloves" || key === "Boots") {
    return [specific, "armour"];
  }
  if (key === "Weapon 1" || key === "Weapon 2") {
    if (itemClass && CASTER_CLASSES.has(itemClass)) return ["caster", "weapon"];
    if (itemClass) return ["weapon", "martial weapon", "caster"];
    // Unknown class — try both.
    return ["weapon", "caster"];
  }
  return [specific];
}
