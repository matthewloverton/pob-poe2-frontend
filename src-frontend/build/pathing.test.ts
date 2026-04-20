import { describe, expect, test } from "vitest";
import { shortestPath, buildGraph } from "./pathing";
import type { PassiveNode } from "../types/tree";

function node(id: number, links: number[]): [string, PassiveNode] {
  return [String(id), { skill: id, connections: links.map((l) => ({ id: l, orbit: 0 })) }];
}

describe("shortestPath", () => {
  test("returns [] when to is already allocated", () => {
    const nodes = Object.fromEntries([
      node(1, [2]),
      node(2, [1, 3]),
      node(3, [2]),
    ]);
    const graph = buildGraph(nodes);
    expect(shortestPath(new Set([1, 2]), 2, graph)).toEqual([]);
  });

  test("simple linear graph", () => {
    const nodes = Object.fromEntries([
      node(1, [2]),
      node(2, [1, 3]),
      node(3, [2, 4]),
      node(4, [3]),
    ]);
    const graph = buildGraph(nodes);
    expect(shortestPath(new Set([1]), 4, graph)).toEqual([2, 3, 4]);
  });

  test("branching graph picks shorter path", () => {
    const nodes = Object.fromEntries([
      node(1, [2, 4]),
      node(2, [1, 3]),
      node(3, [2, 5]),
      node(4, [1, 5]),
      node(5, [3, 4]),
    ]);
    const graph = buildGraph(nodes);
    expect(shortestPath(new Set([1]), 5, graph)).toEqual([4, 5]);
  });

  test("unreachable returns null", () => {
    const nodes = Object.fromEntries([
      node(1, [2]),
      node(2, [1]),
      node(3, [4]),
      node(4, [3]),
    ]);
    const graph = buildGraph(nodes);
    expect(shortestPath(new Set([1]), 4, graph)).toBeNull();
  });

  test("empty allocated set returns null", () => {
    const nodes = Object.fromEntries([node(1, [2]), node(2, [1])]);
    const graph = buildGraph(nodes);
    expect(shortestPath(new Set(), 2, graph)).toBeNull();
  });
});
