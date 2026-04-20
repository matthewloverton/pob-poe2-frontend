import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parseBuildXml } from "./xmlImport";

const minimal = readFileSync("test/fixtures/minimal-build.xml", "utf8");

describe("parseBuildXml", () => {
  test("reads active spec's URL and class", () => {
    const parsed = parseBuildXml(minimal);
    expect(parsed.activeSpec.classId).toBe(1);
    expect(parsed.activeSpec.ascendancyId).toBe(0);
    expect(parsed.activeSpec.treeUrl).toBe("https://www.pathofexile.com/passive-skill-tree/AAAABAEAAAAA");
    expect(parsed.sourceXml).toBe(minimal);
  });

  test("throws on non-PathOfBuilding root", () => {
    expect(() => parseBuildXml("<Other></Other>")).toThrow(/PathOfBuilding/);
  });
});
