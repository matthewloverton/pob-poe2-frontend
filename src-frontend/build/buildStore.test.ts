import { beforeEach, describe, expect, test } from "vitest";
import { useBuildStore } from "./buildStore";

describe("buildStore", () => {
  beforeEach(() => {
    useBuildStore.setState(useBuildStore.getInitialState(), true);
  });

  test("initial state is empty", () => {
    const s = useBuildStore.getState();
    expect(s.classId).toBe(0);
    expect(s.ascendancyId).toBe(0);
    expect(s.allocated.size).toBe(0);
    expect(s.dirty).toBe(false);
    expect(s.sourceXml).toBeNull();
  });

  test("loadFromParsed replaces state and clears dirty", () => {
    useBuildStore.getState().allocate([999]);
    useBuildStore.getState().loadFromParsed({
      activeSpec: { classId: 2, ascendancyId: 1, treeUrl: "u", title: "t", treeVersion: "0_2" },
      sourceXml: "<PathOfBuilding/>",
    }, [1, 2, 3]);
    const s = useBuildStore.getState();
    expect(s.classId).toBe(2);
    expect(s.ascendancyId).toBe(1);
    expect([...s.allocated].sort()).toEqual([1, 2, 3]);
    expect(s.dirty).toBe(false);
    expect(s.sourceXml).toBe("<PathOfBuilding/>");
  });

  test("allocate adds ids and sets dirty", () => {
    useBuildStore.getState().allocate([10, 11]);
    const s = useBuildStore.getState();
    expect([...s.allocated].sort()).toEqual([10, 11]);
    expect(s.dirty).toBe(true);
  });

  test("deallocate removes id and sets dirty", () => {
    useBuildStore.getState().allocate([10, 11]);
    useBuildStore.getState().deallocate(10);
    const s = useBuildStore.getState();
    expect([...s.allocated]).toEqual([11]);
    expect(s.dirty).toBe(true);
  });
});
