import { describe, expect, test } from "vitest";
import { decodeTreeUrl, encodeTreeUrl, type DecodedTreeUrl } from "./treeUrlCodec";

function freshBuild(): DecodedTreeUrl {
  return {
    version: 6, classId: 1, ascendClassId: 0, secondaryAscendClassId: 0,
    nodes: [1234, 5678, 9012],
    clusterNodes: [],
    masteryEffects: [],
  };
}

describe("treeUrlCodec", () => {
  test("round-trips a small allocation", () => {
    const input = freshBuild();
    const decoded = decodeTreeUrl(encodeTreeUrl(input));
    expect(decoded).toEqual({ ...input, version: 6 });
  });

  test("round-trips empty allocation", () => {
    const input: DecodedTreeUrl = {
      version: 6, classId: 0, ascendClassId: 0, secondaryAscendClassId: 0,
      nodes: [], clusterNodes: [], masteryEffects: [],
    };
    expect(decodeTreeUrl(encodeTreeUrl(input))).toEqual(input);
  });

  test("round-trips cluster nodes (id offset preserved)", () => {
    const input: DecodedTreeUrl = {
      version: 6, classId: 2, ascendClassId: 1, secondaryAscendClassId: 0,
      nodes: [100, 200],
      clusterNodes: [65536, 65537, 70000],
      masteryEffects: [],
    };
    expect(decodeTreeUrl(encodeTreeUrl(input))).toEqual(input);
  });

  test("round-trips mastery effects", () => {
    const input: DecodedTreeUrl = {
      version: 6, classId: 1, ascendClassId: 0, secondaryAscendClassId: 0,
      nodes: [42],
      clusterNodes: [],
      masteryEffects: [{ effectId: 111, nodeId: 42 }, { effectId: 222, nodeId: 42 }],
    };
    expect(decodeTreeUrl(encodeTreeUrl(input))).toEqual(input);
  });

  test("round-trips packed ascendancy bits", () => {
    const input: DecodedTreeUrl = {
      version: 6, classId: 3, ascendClassId: 2, secondaryAscendClassId: 1,
      nodes: [], clusterNodes: [], masteryEffects: [],
    };
    expect(decodeTreeUrl(encodeTreeUrl(input))).toEqual(input);
  });

  test("strips pathofexile.com URL prefix", () => {
    const input = freshBuild();
    const encoded = encodeTreeUrl(input);
    const full = `https://www.pathofexile.com/passive-skill-tree/${encoded}`;
    expect(decodeTreeUrl(full)).toEqual({ ...input, version: 6 });
  });

  test("rejects malformed input", () => {
    expect(() => decodeTreeUrl("not-base64!@#")).toThrow();
    expect(() => decodeTreeUrl("")).toThrow();
  });
});
