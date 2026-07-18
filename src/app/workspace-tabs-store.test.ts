import { describe, expect, test, beforeEach } from "vitest";
import { useWorkspaceTabsStore, isOpenWorkspaceTab, type WorkspaceSession } from "./workspace-tabs-store";
import { createShellStore } from "./store";
import type { WorkspaceInfo } from "../shared/module-sdk";

function fakeWorkspace(id: string): WorkspaceInfo {
  return {
    id,
    name: id,
    version: 1,
    root: `/tmp/${id}`,
    modules: { api_client: true, utilities: true, mail: false, db: false, logs: false },
  };
}

function fakeSession(id: string): WorkspaceSession {
  return { shellStore: createShellStore(fakeWorkspace(id)) };
}

describe("useWorkspaceTabsStore", () => {
  beforeEach(() => {
    // Reset to a single fresh welcome tab between tests, mirroring the
    // module's own initial state shape.
    useWorkspaceTabsStore.setState({
      tabs: [{ id: "reset-tab", kind: "welcome", workspace: null, session: null }],
      activeTabId: "reset-tab",
    });
  });

  test("addWelcomeTab appends and focuses a new welcome tab", () => {
    const id = useWorkspaceTabsStore.getState().addWelcomeTab();
    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(id);
    expect(state.tabs.find((t) => t.id === id)?.kind).toBe("welcome");
  });

  test("attachWorkspace converts a welcome tab in place, same id", () => {
    const id = useWorkspaceTabsStore.getState().addWelcomeTab();
    useWorkspaceTabsStore.getState().attachWorkspace(id, fakeWorkspace("ws-x"), fakeSession("ws-x"));

    const tab = useWorkspaceTabsStore.getState().tabs.find((t) => t.id === id);
    expect(tab?.kind).toBe("workspace");
    expect(tab && isOpenWorkspaceTab(tab) && tab.workspace.id).toBe("ws-x");
  });

  test("removeTab always leaves at least one tab", () => {
    const only = useWorkspaceTabsStore.getState().tabs[0]?.id;
    if (!only) throw new Error("expected an initial tab");
    useWorkspaceTabsStore.getState().removeTab(only);

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
  });

  test("removeTab reassigns active tab when the active one closes", () => {
    const id2 = useWorkspaceTabsStore.getState().addWelcomeTab();
    const id3 = useWorkspaceTabsStore.getState().addWelcomeTab();
    // id3 is active (last-added). Closing it should fall back to id2.
    useWorkspaceTabsStore.getState().removeTab(id3);

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["reset-tab", id2]);
    expect(state.activeTabId).toBe(id2);
  });

  test("removeTab on a non-active tab leaves the active tab untouched", () => {
    const id2 = useWorkspaceTabsStore.getState().addWelcomeTab();
    useWorkspaceTabsStore.getState().setActiveTab(id2);
    useWorkspaceTabsStore.getState().removeTab("reset-tab");

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(id2);
  });

  test("findTabByPath matches on the attached workspace's root", () => {
    const id = useWorkspaceTabsStore.getState().addWelcomeTab();
    useWorkspaceTabsStore.getState().attachWorkspace(id, fakeWorkspace("ws-y"), fakeSession("ws-y"));

    const found = useWorkspaceTabsStore.getState().findTabByPath("/tmp/ws-y");
    expect(found?.id).toBe(id);
    expect(useWorkspaceTabsStore.getState().findTabByPath("/tmp/nonexistent")).toBeUndefined();
  });

  test("two attached workspace tabs keep fully independent sessions", () => {
    const idA = useWorkspaceTabsStore.getState().addWelcomeTab();
    useWorkspaceTabsStore.getState().attachWorkspace(idA, fakeWorkspace("ws-a"), fakeSession("ws-a"));
    const idB = useWorkspaceTabsStore.getState().addWelcomeTab();
    useWorkspaceTabsStore.getState().attachWorkspace(idB, fakeWorkspace("ws-b"), fakeSession("ws-b"));

    const tabA = useWorkspaceTabsStore.getState().tabs.find((t) => t.id === idA);
    const tabB = useWorkspaceTabsStore.getState().tabs.find((t) => t.id === idB);
    if (!tabA || !isOpenWorkspaceTab(tabA)) throw new Error("expected open tab A");
    if (!tabB || !isOpenWorkspaceTab(tabB)) throw new Error("expected open tab B");

    tabA.session.shellStore.getState().setActiveEnv("staging");
    expect(tabB.session.shellStore.getState().activeEnv).toBe("local");
    expect(tabA.session.shellStore).not.toBe(tabB.session.shellStore);
  });
});
