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
  "Greater Iron Rune": {
    slots: {
      weapon: { type: "Rune", mods: ["18% increased Physical Damage"] },
      caster: { type: "Rune", mods: ["30% increased Spell Damage"] },
      armour: { type: "Rune", mods: ["18% increased Armour, Evasion and Energy Shield"] },
    },
  },
};

describe("socketablesStore", () => {
  beforeEach(() => {
    useSocketablesStore.setState({ schema: null });
  });

  it("lookup returns the entry for the first matching candidate", () => {
    useSocketablesStore.setState({ schema });
    const hit = useSocketablesStore.getState().lookup("Hayoxi's Soul Core of Heatproofing", ["helmet", "armour"]);
    expect(hit).toEqual({ type: "Rune", mods: ["+40% of Armour also applies to Cold Damage"] });
  });

  it("lookup walks the candidate list in order", () => {
    useSocketablesStore.setState({ schema });
    // Helmet doesn't exist on Greater Iron Rune; armour does.
    const hit = useSocketablesStore.getState().lookup("Greater Iron Rune", ["helmet", "armour"]);
    expect(hit?.mods).toEqual(["18% increased Armour, Evasion and Energy Shield"]);
  });

  it("lookup picks weapon vs caster based on candidate order", () => {
    useSocketablesStore.setState({ schema });
    const martial = useSocketablesStore.getState().lookup("Greater Iron Rune", ["weapon", "caster"]);
    const caster = useSocketablesStore.getState().lookup("Greater Iron Rune", ["caster", "weapon"]);
    expect(martial?.mods).toEqual(["18% increased Physical Damage"]);
    expect(caster?.mods).toEqual(["30% increased Spell Damage"]);
  });

  it("lookup falls back to the first available slot when no candidate matches", () => {
    useSocketablesStore.setState({ schema });
    const hit = useSocketablesStore.getState().lookup("Atmohua's Soul Core of Retreat", ["helmet"]);
    expect(hit?.mods).toEqual(["30% faster start of Energy Shield Recharge"]);
  });

  it("lookup returns null when name unknown", () => {
    useSocketablesStore.setState({ schema });
    expect(useSocketablesStore.getState().lookup("Not A Real Rune", ["helmet"])).toBeNull();
  });

  it("lookup returns null when schema not loaded", () => {
    expect(useSocketablesStore.getState().lookup("Anything", ["helmet"])).toBeNull();
  });
});
