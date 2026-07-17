import { describe, expect, test, vi, beforeEach } from "vitest";

const mockPrefs = new Map<string, unknown>();

vi.mock("../shared/prefs", () => ({
  getPref: vi.fn(async (key: string) => (mockPrefs.has(key) ? mockPrefs.get(key) : null)),
  setPref: vi.fn(async (key: string, value: unknown) => {
    mockPrefs.set(key, value);
  }),
}));

import { useSettingsStore } from "./settings-store";

describe("useSettingsStore", () => {
  beforeEach(() => {
    mockPrefs.clear();
    useSettingsStore.setState({
      loaded: false,
      defaultWorkspaceFolder: "",
      reopenLastSession: true,
      railCollapsedDefault: false,
    });
  });

  test("load() defaults to built-in folder, reopen-on, rail-expanded when nothing is persisted", async () => {
    await useSettingsStore.getState().load();
    const s = useSettingsStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.defaultWorkspaceFolder).toBe("");
    expect(s.reopenLastSession).toBe(true);
    expect(s.railCollapsedDefault).toBe(false);
  });

  test("load() picks up persisted values", async () => {
    mockPrefs.set("defaultWorkspaceFolder", "/home/user/Projects");
    mockPrefs.set("reopenLastSession", false);
    mockPrefs.set("railCollapsed", true);

    await useSettingsStore.getState().load();
    const s = useSettingsStore.getState();
    expect(s.defaultWorkspaceFolder).toBe("/home/user/Projects");
    expect(s.reopenLastSession).toBe(false);
    expect(s.railCollapsedDefault).toBe(true);
  });

  test("setDefaultWorkspaceFolder updates state and persists", async () => {
    await useSettingsStore.getState().setDefaultWorkspaceFolder("/tmp/ws");
    expect(useSettingsStore.getState().defaultWorkspaceFolder).toBe("/tmp/ws");
    expect(mockPrefs.get("defaultWorkspaceFolder")).toBe("/tmp/ws");
  });

  test("setReopenLastSession updates state and persists", async () => {
    await useSettingsStore.getState().setReopenLastSession(false);
    expect(useSettingsStore.getState().reopenLastSession).toBe(false);
    expect(mockPrefs.get("reopenLastSession")).toBe(false);
  });

  test("setRailCollapsedDefault updates state and persists under the railCollapsed key", async () => {
    await useSettingsStore.getState().setRailCollapsedDefault(true);
    expect(useSettingsStore.getState().railCollapsedDefault).toBe(true);
    expect(mockPrefs.get("railCollapsed")).toBe(true);
  });
});
