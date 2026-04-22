import { describe, expect, test, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { parseBuildXml } from "./xmlImport";
import { serializeBuild } from "./xmlExport";
import { useConfigStore } from "../config/configStore";

const minimal = readFileSync("test/fixtures/minimal-build.xml", "utf8");

describe("serializeBuild", () => {
  test("round-trips unchanged build", () => {
    const parsed = parseBuildXml(minimal);
    const out = serializeBuild(parsed, { newTreeUrl: parsed.activeSpec.treeUrl });
    const reparsed = parseBuildXml(out);
    expect(reparsed.activeSpec).toEqual(parsed.activeSpec);
  });

  test("replaces only the URL when tree url changes", () => {
    const parsed = parseBuildXml(minimal);
    const NEW_URL = "https://www.pathofexile.com/passive-skill-tree/AAAABAEAAAAA-NEW";
    const out = serializeBuild(parsed, { newTreeUrl: NEW_URL });
    const reparsed = parseBuildXml(out);
    expect(reparsed.activeSpec.treeUrl).toBe(NEW_URL);
    expect(reparsed.activeSpec.classId).toBe(parsed.activeSpec.classId);
    expect(reparsed.activeSpec.title).toBe(parsed.activeSpec.title);
    expect(out).toContain("<Items");
    expect(out).toContain("<Calcs");
    expect(out).toContain("<Notes");
  });
});

describe("xmlExport Config", () => {
  beforeEach(() => {
    useConfigStore.setState({
      schema: {
        sections: [{
          name: "General",
          options: [{ var: "conditionLowLife", type: "check", label: "Low Life" }],
        }],
      },
      values: { conditionLowLife: true },
    });
  });

  test("includes Config values from configStore in exported XML", () => {
    const parsed = parseBuildXml(minimal);
    const out = serializeBuild(parsed, { newTreeUrl: parsed.activeSpec.treeUrl });
    expect(out).toContain('<Input name="conditionLowLife" boolean="true"/>');
  });

  test("replaces self-closing <Config/> form", () => {
    const src = minimal.replace(/<Config \/>/, "<Config/>");
    const parsed = parseBuildXml(src);
    parsed.sourceXml = src;
    const out = serializeBuild(parsed, { newTreeUrl: parsed.activeSpec.treeUrl });
    expect(out).toContain('<Input name="conditionLowLife" boolean="true"/>');
    expect(out).not.toContain("<Config/>");
    expect((out.match(/<Config/g) ?? []).length).toBe(1);
  });

  test("replaces self-closing <Config /> form with whitespace", () => {
    // minimal-build.xml already uses <Config /> — exercise it directly
    const parsed = parseBuildXml(minimal);
    const out = serializeBuild(parsed, { newTreeUrl: parsed.activeSpec.treeUrl });
    expect(out).toContain('<Input name="conditionLowLife" boolean="true"/>');
    expect(out).not.toContain("<Config />");
    expect((out.match(/<Config/g) ?? []).length).toBe(1);
  });

  test("inserts Config when none exists in source", () => {
    const src = minimal.replace(/<Config \/>/, "");
    const parsed = parseBuildXml(src);
    parsed.sourceXml = src;
    const out = serializeBuild(parsed, { newTreeUrl: parsed.activeSpec.treeUrl });
    expect(out).toContain('<Input name="conditionLowLife" boolean="true"/>');
    expect((out.match(/<Config/g) ?? []).length).toBe(1);
  });
});
