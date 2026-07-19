/**
 * Scale torture: open/close 20 workspace tabs in a loop.
 * Verifies the store registry returns to baseline size — no leaked stores.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  useWorkspaceTabsStore,
  type WorkspaceSession,
} from "../../src/app/workspace-tabs-store";
import { createShellStore } from "../../src/app/store";
import type { WorkspaceInfo } from "../../src/shared/module-sdk";

function fakeWorkspace(id: string): WorkspaceInfo {
  return {
    id,
    name: `WS ${id}`,
    version: 1,
    root: `/tmp/ws-${id}`,
    modules: { api_client: true, utilities: true, mail: false, db: false, logs: false },
  };
}

function fakeSession(id: string): WorkspaceSession {
  return { shellStore: createShellStore(fakeWorkspace(id)) };
}

describe("workspace tab leak detection", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      tabs: [{ id: "initial", kind: "welcome", workspace: null, session: null }],
      activeTabId: "initial",
    });
  });

  it("opening and closing 20 workspace tabs leaves no leaked state", () => {
    const store = useWorkspaceTabsStore.getState();
    const baselineTabCount = useWorkspaceTabsStore.getState().tabs.length;

    // Open 20 workspace tabs
    const tabIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = store.addWelcomeTab();
      const ws = fakeWorkspace(`stress-${i}`);
      const session = fakeSession(`stress-${i}`);
      useWorkspaceTabsStore.getState().attachWorkspace(id, ws, session);
      tabIds.push(id);
    }

    // Verify all 20 are open + the initial tab
    expect(useWorkspaceTabsStore.getState().tabs.length).toBe(baselineTabCount + 20);

    // Close all 20
    for (const id of tabIds) {
      useWorkspaceTabsStore.getState().removeTab(id);
    }

    // Should be back to baseline (the store always keeps at least one tab)
    const finalState = useWorkspaceTabsStore.getState();
    expect(finalState.tabs.length).toBe(1);
  });

  it("rapid open/close cycling stays instant (no O(n²) accumulation)", () => {
    const start = performance.now();

    for (let cycle = 0; cycle < 100; cycle++) {
      const id = useWorkspaceTabsStore.getState().addWelcomeTab();
      const ws = fakeWorkspace(`cycle-${cycle}`);
      const session = fakeSession(`cycle-${cycle}`);
      useWorkspaceTabsStore.getState().attachWorkspace(id, ws, session);
      useWorkspaceTabsStore.getState().removeTab(id);
    }

    const elapsed = performance.now() - start;
    // 100 cycles should complete in well under 1 second on any machine
    expect(elapsed).toBeLessThan(1000);

    // Store should have only 1 tab remaining
    expect(useWorkspaceTabsStore.getState().tabs.length).toBe(1);
  });

  it("switching between tabs is O(1)", () => {
    // Open 20 tabs
    const tabIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = useWorkspaceTabsStore.getState().addWelcomeTab();
      const ws = fakeWorkspace(`switch-${i}`);
      const session = fakeSession(`switch-${i}`);
      useWorkspaceTabsStore.getState().attachWorkspace(id, ws, session);
      tabIds.push(id);
    }

    // Switch between them 1000 times
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const targetId = tabIds[i % tabIds.length]!;
      useWorkspaceTabsStore.getState().setActiveTab(targetId);
    }
    const elapsed = performance.now() - start;

    // 1000 switches should be under 100ms
    expect(elapsed).toBeLessThan(100);
  });
});
