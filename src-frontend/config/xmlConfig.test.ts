import { describe, it, expect } from "vitest";
import { parseConfigXml, serializeConfigXml } from "./xmlConfig";
import type { ConfigSchema } from "./types";

describe("parseConfigXml", () => {
  it("parses number/boolean/string inputs", () => {
    const xml = `
      <Build>
        <Config>
          <Input name="resistancePenalty" number="-60"/>
          <Input name="conditionLowLife" boolean="true"/>
          <Input name="enemyIsBoss" string="Pinnacle"/>
        </Config>
      </Build>`;
    expect(parseConfigXml(xml)).toEqual({
      resistancePenalty: -60,
      conditionLowLife: true,
      enemyIsBoss: "Pinnacle",
    });
  });

  it("returns empty object when <Config> is missing", () => {
    expect(parseConfigXml("<Build/>")).toEqual({});
  });
});

describe("serializeConfigXml", () => {
  const schema: ConfigSchema = {
    sections: [{
      name: "General",
      options: [
        { var: "resistancePenalty", type: "list", label: "Res", list: [{ val: -60, label: "Endgame" }] },
        { var: "conditionLowLife", type: "check", label: "Low Life" },
        { var: "enemyIsBoss", type: "list", label: "Boss", list: [{ val: "Pinnacle", label: "Pinnacle" }] },
        { var: "detonateDeadCorpseLife", type: "count", label: "Corpse Life" },
      ],
    }],
  };

  it("emits correct attribute shape per option type", () => {
    const out = serializeConfigXml(schema, {
      resistancePenalty: -60,
      conditionLowLife: true,
      enemyIsBoss: "Pinnacle",
      detonateDeadCorpseLife: 12345,
    });
    expect(out).toContain('<Input name="resistancePenalty" number="-60"/>');
    expect(out).toContain('<Input name="conditionLowLife" boolean="true"/>');
    expect(out).toContain('<Input name="enemyIsBoss" string="Pinnacle"/>');
    expect(out).toContain('<Input name="detonateDeadCorpseLife" number="12345"/>');
    expect(out.startsWith("<Config>")).toBe(true);
    expect(out.endsWith("</Config>")).toBe(true);
  });

  it("preserves unknown keys as string inputs (upstream option removed)", () => {
    const out = serializeConfigXml(schema, { mysteryLegacyKey: "keepMe" });
    expect(out).toContain('<Input name="mysteryLegacyKey" string="keepMe"/>');
  });

  it("skips values equal to schema default", () => {
    const schemaWithDefault: ConfigSchema = {
      sections: [{
        name: "General",
        options: [{ var: "conditionLowLife", type: "check", label: "Low", default: false }],
      }],
    };
    const out = serializeConfigXml(schemaWithDefault, { conditionLowLife: false });
    expect(out).not.toContain("conditionLowLife");
  });
});
