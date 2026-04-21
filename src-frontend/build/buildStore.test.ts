import { beforeEach, describe, expect, test } from "vitest";
import { useBuildStore, countUserAllocated } from "./buildStore";
import { classStartId } from "./classStarts";

const RANGER_ID = 2;
const RANGER_START = classStartId(RANGER_ID)!;
const WITCH_ID = 1;
const WITCH_START = classStartId(WITCH_ID)!;

describe("buildStore", () => {
  beforeEach(() => {
    useBuildStore.setState(useBuildStore.getInitialState(), true);
  });

  test("initial state defaults to Ranger with only the class-start node anchored", () => {
    const s = useBuildStore.getState();
    expect(s.classId).toBe(RANGER_ID);
    expect(s.classStartId).toBe(RANGER_START);
    expect([...s.allocated]).toEqual([RANGER_START]);
    expect(countUserAllocated(s)).toBe(0);
    expect(s.dirty).toBe(false);
    expect(s.sourceXml).toBeNull();
  });

  test("loadFromParsed replaces state and ensures the imported class start is anchored", () => {
    useBuildStore.getState().allocate([999]);
    useBuildStore.getState().loadFromParsed({
      activeSpec: { classId: RANGER_ID, ascendancyId: 1, treeUrl: "u", title: "t", treeVersion: "0_2" },
      sourceXml: "<PathOfBuilding/>",
    }, [1, 2, 3]);
    const s = useBuildStore.getState();
    expect(s.classId).toBe(RANGER_ID);
    expect(s.ascendancyId).toBe(1);
    expect([...s.allocated].sort((a, b) => a - b)).toEqual([1, 2, 3, RANGER_START].sort((a, b) => a - b));
    expect(s.dirty).toBe(false);
    expect(s.sourceXml).toBe("<PathOfBuilding/>");
  });

  test("allocate adds ids and sets dirty", () => {
    useBuildStore.getState().allocate([10, 11]);
    const s = useBuildStore.getState();
    expect([...s.allocated].sort((a, b) => a - b)).toEqual([10, 11, RANGER_START].sort((a, b) => a - b));
    expect(s.dirty).toBe(true);
  });

  test("deallocate removes id but refuses to remove the class-start anchor", () => {
    useBuildStore.getState().allocate([10, 11]);
    useBuildStore.getState().deallocate(10);
    expect([...useBuildStore.getState().allocated].sort((a, b) => a - b)).toEqual([11, RANGER_START].sort((a, b) => a - b));
    useBuildStore.getState().deallocate(RANGER_START);
    expect(useBuildStore.getState().allocated.has(RANGER_START)).toBe(true);
  });

  test("setClass swaps the anchor while the user has no passives allocated", () => {
    useBuildStore.getState().setClass(WITCH_ID);
    const s = useBuildStore.getState();
    expect(s.classId).toBe(WITCH_ID);
    expect(s.classStartId).toBe(WITCH_START);
    expect([...s.allocated]).toEqual([WITCH_START]);
  });

  test("setClass is blocked once the user has allocated any passive", () => {
    useBuildStore.getState().allocate([10]);
    useBuildStore.getState().setClass(WITCH_ID);
    const s = useBuildStore.getState();
    expect(s.classId).toBe(RANGER_ID);
    expect(s.classStartId).toBe(RANGER_START);
  });
});
