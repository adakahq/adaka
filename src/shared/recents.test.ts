import { describe, expect, test, vi, beforeEach } from "vitest";

let mockStore: Record<string, unknown> = {};

vi.mock("./prefs", () => ({
  getPref: vi.fn(async (key: string) => mockStore[key] ?? null),
  setPref: vi.fn(async (key: string, value: unknown) => {
    mockStore[key] = value;
  }),
}));

import { getRecents, addRecent, removeRecent } from "./recents";

describe("recents", () => {
  beforeEach(() => {
    mockStore = {};
  });

  test("getRecents returns empty array initially", async () => {
    expect(await getRecents()).toEqual([]);
  });

  test("addRecent adds and returns entry", async () => {
    const result = await addRecent({ name: "My Project", path: "/home/user/proj" });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("My Project");
    expect(result[0]?.path).toBe("/home/user/proj");
    expect(result[0]?.lastOpened).toBeDefined();
  });

  test("addRecent deduplicates by path, moves to front", async () => {
    await addRecent({ name: "First", path: "/a" });
    await addRecent({ name: "Second", path: "/b" });
    const result = await addRecent({ name: "First Updated", path: "/a" });
    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe("/a");
    expect(result[0]?.name).toBe("First Updated");
    expect(result[1]?.path).toBe("/b");
  });

  test("addRecent caps at 8 entries", async () => {
    for (let i = 0; i < 10; i++) {
      await addRecent({ name: `Proj ${i}`, path: `/path/${i}` });
    }
    const result = await getRecents();
    expect(result).toHaveLength(8);
    expect(result[0]?.path).toBe("/path/9");
  });

  test("removeRecent filters entry by path", async () => {
    await addRecent({ name: "A", path: "/a" });
    await addRecent({ name: "B", path: "/b" });
    const result = await removeRecent("/a");
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("/b");
  });

  test("removeRecent on non-existent path is no-op", async () => {
    await addRecent({ name: "A", path: "/a" });
    const result = await removeRecent("/nonexistent");
    expect(result).toHaveLength(1);
  });
});
