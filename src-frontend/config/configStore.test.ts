import { describe, it, expect, beforeEach } from "vitest";
import { useConfigStore } from "./configStore";
import type { ConfigSchema } from "./types";

const schema: ConfigSchema = {
  sections: [{
    name: "General",
    options: [
      { var: "conditionLowLife", type: "check", label: "Low Life" },
      { var: "resistancePenalty", type: "list", label: "Res",
        list: [{ val: 0, label: "Act 1" }, { val: -60, label: "Endgame" }] },
    ],
  }],
};

describe("configStore", () => {
  beforeEach(() => {
    useConfigStore.setState({ schema: null, values: {} });
  });

  it("loads values from <Config> XML", () => {
    useConfigStore.setState({ schema });
    useConfigStore.getState().loadXml(`
      <Build><Config>
        <Input name="conditionLowLife" boolean="true"/>
        <Input name="resistancePenalty" number="-60"/>
      </Config></Build>`);
    expect(useConfigStore.getState().values).toEqual({
      conditionLowLife: true,
      resistancePenalty: -60,
    });
  });

  it("set updates a single value without touching others", () => {
    useConfigStore.setState({ schema, values: { conditionLowLife: true } });
    useConfigStore.getState().set("resistancePenalty", -60);
    expect(useConfigStore.getState().values).toEqual({
      conditionLowLife: true,
      resistancePenalty: -60,
    });
  });

  it("toXml round-trips through serialize", () => {
    useConfigStore.setState({
      schema,
      values: { conditionLowLife: true, resistancePenalty: -60 },
    });
    const out = useConfigStore.getState().toXml();
    expect(out).toContain('conditionLowLife" boolean="true"');
    expect(out).toContain('resistancePenalty" number="-60"');
  });
});
