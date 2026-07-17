import { describe, expect, test, vi, beforeEach } from "vitest";

interface MockRecent {
  name: string;
  path: string;
  lastOpened: string;
}

let mockList: MockRecent[] = [];

// addRecent/removeRecent are implemented as Rust commands (see prefs.rs) so
// two windows adding a recent workspace at nearly the same time can't race
// each other via separate get-pref/set-pref round trips. Mock the same
// add-or-bump / cap-at-8 / remove-by-path behavior here.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "core_add_recent_workspace") {
      const { name, path, lastOpened } = args as { name: string; path: string; lastOpened: string };
      mockList = mockList.filter((r) => r.path !== path);
      mockList.unshift({ name, path, lastOpened });
      mockList = mockList.slice(0, 8);
      return mockList;
    }
    if (cmd === "core_remove_recent_workspace") {
      const { path } = args as { path: string };
      mockList = mockList.filter((r) => r.path !== path);
      return mockList;
    }
    throw new Error(`unexpected invoke: ${cmd}`);
  }),
}));

vi.mock("./prefs", () => ({
  getPref: vi.fn(async (key: string) => (key === "recentWorkspaces" ? mockList : null)),
}));

import { getRecents, addRecent, removeRecent } from "./recents";

describe("recents", () => {
  beforeEach(() => {
    mockList = [];
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
