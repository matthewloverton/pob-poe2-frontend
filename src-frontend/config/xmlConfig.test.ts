import { describe, it, expect } from "vitest";
import { parseConfigXml } from "./xmlConfig";

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
