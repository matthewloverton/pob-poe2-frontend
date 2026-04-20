import { describe, expect, test } from "vitest";
import { nodeWorldPosition, nodesShareOrbit } from "./geometry";
import type { PassiveNode, PassiveGroup, TreeConstants } from "../types/tree";

const constants: TreeConstants = {
  skillsPerOrbit: [1, 6, 12, 12, 40],
  orbitRadii: [0, 82, 162, 335, 493],
  orbitAnglesByOrbit: [
    [0],
    [0, 60, 120, 180, 240, 300],
    [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
    [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
    Array.from({ length: 40 }, (_, i) => i * 9),
  ],
};

const groups: Record<string, PassiveGroup> = {
  "1": { x: 100, y: 200 },
};

describe("nodeWorldPosition", () => {
  test("orbit 0 returns group center", () => {
    const node: PassiveNode = { skill: 1, group: 1, orbit: 0, orbitIndex: 0 };
    expect(nodeWorldPosition(node, groups, constants)).toEqual({ x: 100, y: 200 });
  });

  test("orbit 1 index 0 is directly above group center (angle 0)", () => {
    const node: PassiveNode = { skill: 1, group: 1, orbit: 1, orbitIndex: 0 };
    const pos = nodeWorldPosition(node, groups, constants);
    expect(pos.x).toBeCloseTo(100, 5);
    expect(pos.y).toBeCloseTo(200 - 82, 5);
  });

  test("orbit 1 index 3 is directly below group center (angle 180)", () => {
    const node: PassiveNode = { skill: 1, group: 1, orbit: 1, orbitIndex: 3 };
    const pos = nodeWorldPosition(node, groups, constants);
    expect(pos.x).toBeCloseTo(100, 5);
    expect(pos.y).toBeCloseTo(200 + 82, 5);
  });

  test("missing group returns 0,0", () => {
    const node: PassiveNode = { skill: 1, group: 999, orbit: 1, orbitIndex: 0 };
    expect(nodeWorldPosition(node, groups, constants)).toEqual({ x: 0, y: 0 });
  });
});

describe("nodesShareOrbit", () => {
  test("same group and orbit => true", () => {
    const a: PassiveNode = { skill: 1, group: 1, orbit: 2, orbitIndex: 0 };
    const b: PassiveNode = { skill: 2, group: 1, orbit: 2, orbitIndex: 1 };
    expect(nodesShareOrbit(a, b)).toBe(true);
  });

  test("same group different orbit => false", () => {
    const a: PassiveNode = { skill: 1, group: 1, orbit: 1, orbitIndex: 0 };
    const b: PassiveNode = { skill: 2, group: 1, orbit: 2, orbitIndex: 0 };
    expect(nodesShareOrbit(a, b)).toBe(false);
  });

  test("different groups => false", () => {
    const a: PassiveNode = { skill: 1, group: 1, orbit: 1, orbitIndex: 0 };
    const b: PassiveNode = { skill: 2, group: 2, orbit: 1, orbitIndex: 0 };
    expect(nodesShareOrbit(a, b)).toBe(false);
  });
});
