import { describe, it, expect, beforeEach } from "vitest";
import { useSocketablesStore } from "./socketablesStore";
import type { SocketableSchema } from "./types";

const schema: SocketableSchema = {
  "Hayoxi's Soul Core of Heatproofing": {
    slots: {
      helmet: { type: "Rune", mods: ["+40% of Armour also applies to Cold Damage"] },
    },
  },
  "Atmohua's Soul Core of Retreat": {
    slots: {
      "body armour": { type: "Rune", mods: ["30% faster start of Energy Shield Recharge"] },
      focus: { type: "Rune", mods: ["30% faster start of Energy Shield Recharge"] },
    },
  },
};

describe("socketablesStore", () => {
  beforeEach(() => {
    useSocketablesStore.setState({ schema: null });
  });

  it("lookup returns the entry for a matching name + slot", () => {
    useSocketablesStore.setState({ schema });
    const hit = useSocketablesStore.getState().lookup("Hayoxi's Soul Core of Heatproofing", "helmet");
    expect(hit).toEqual({ type: "Rune", mods: ["+40% of Armour also applies to Cold Damage"] });
  });

  it("lookup falls back to the first available slot when slot missing", () => {
    useSocketablesStore.setState({ schema });
    const hit = useSocketablesStore.getState().lookup("Atmohua's Soul Core of Retreat", "helmet");
    expect(hit?.mods).toEqual(["30% faster start of Energy Shield Recharge"]);
  });

  it("lookup returns null when name unknown", () => {
    useSocketablesStore.setState({ schema });
    expect(useSocketablesStore.getState().lookup("Not A Real Rune", "helmet")).toBeNull();
  });

  it("lookup returns null when schema not loaded", () => {
    expect(useSocketablesStore.getState().lookup("Anything", "helmet")).toBeNull();
  });
});
