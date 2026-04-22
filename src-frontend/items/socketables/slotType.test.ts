import { describe, it, expect } from "vitest";
import { slotTypeForKey } from "./slotType";

describe("slotTypeForKey", () => {
  it("maps each SlotKey to PoB's lowercase slot name", () => {
    expect(slotTypeForKey("Weapon 1")).toBe("weapon");
    expect(slotTypeForKey("Weapon 2")).toBe("weapon");
    expect(slotTypeForKey("Helmet")).toBe("helmet");
    expect(slotTypeForKey("Body Armour")).toBe("body armour");
    expect(slotTypeForKey("Gloves")).toBe("gloves");
    expect(slotTypeForKey("Boots")).toBe("boots");
    expect(slotTypeForKey("Amulet")).toBe("amulet");
    expect(slotTypeForKey("Ring 1")).toBe("ring");
    expect(slotTypeForKey("Ring 2")).toBe("ring");
    expect(slotTypeForKey("Belt")).toBe("belt");
    expect(slotTypeForKey("Flask 1")).toBe("flask");
    expect(slotTypeForKey("Flask 2")).toBe("flask");
    expect(slotTypeForKey("Charm 1")).toBe("charm");
    expect(slotTypeForKey("Charm 2")).toBe("charm");
    expect(slotTypeForKey("Charm 3")).toBe("charm");
  });
});
