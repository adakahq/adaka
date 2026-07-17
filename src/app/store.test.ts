import { describe, expect, test } from "vitest";
import { createShellStore } from "./store";
import type { WorkspaceInfo } from "../shared/module-sdk";

function fakeWorkspace(overrides?: Partial<WorkspaceInfo>): WorkspaceInfo {
  return {
    id: "ws-a",
    name: "Workspace A",
    version: 1,
    root: "/tmp/workspace-a",
    modules: { api_client: true, utilities: true, mail: false, db: false, logs: false },
    ...overrides,
  };
}

describe("createShellStore", () => {
  test("two workspace stores coexist without bleeding", () => {
    const storeA = createShellStore(fakeWorkspace({ id: "ws-a", name: "A" }));
    const storeB = createShellStore(fakeWorkspace({ id: "ws-b", name: "B", root: "/tmp/workspace-b" }));

    storeA.getState().openTab({ id: "api-client:main", label: "API Client", moduleId: "api-client", routePath: "main" });
    storeA.getState().setActiveEnv("staging");

    expect(storeB.getState().tabs).toHaveLength(0);
    expect(storeB.getState().activeEnv).toBe("local");

    storeB.getState().openTab({ id: "utilities:json", label: "JSON", moduleId: "utilities", routePath: "json" });
    storeB.getState().setActiveEnv("prod");

    expect(storeA.getState().tabs).toHaveLength(1);
    expect(storeA.getState().tabs[0]?.id).toBe("api-client:main");
    expect(storeA.getState().activeEnv).toBe("staging");

    expect(storeB.getState().tabs).toHaveLength(1);
    expect(storeB.getState().tabs[0]?.id).toBe("utilities:json");
    expect(storeB.getState().activeEnv).toBe("prod");

    expect(storeA.getState().workspace.id).toBe("ws-a");
    expect(storeB.getState().workspace.id).toBe("ws-b");
  });

  test("closeTab on one store never touches another store's tabs", () => {
    const storeA = createShellStore(fakeWorkspace({ id: "ws-a" }));
    const storeB = createShellStore(fakeWorkspace({ id: "ws-b" }));

    storeA.getState().openTab({ id: "t1", label: "T1", moduleId: "api-client", routePath: "main" });
    storeB.getState().openTab({ id: "t1", label: "T1", moduleId: "api-client", routePath: "main" });

    storeA.getState().closeTab("t1");

    expect(storeA.getState().tabs).toHaveLength(0);
    expect(storeB.getState().tabs).toHaveLength(1);
  });

  test("moduleContexts map is independent per store", () => {
    const storeA = createShellStore(fakeWorkspace({ id: "ws-a" }));
    const storeB = createShellStore(fakeWorkspace({ id: "ws-b" }));

    const ctxA = new Map();
    ctxA.set("api-client", { marker: "A" });
    storeA.getState().setModuleContexts(ctxA);

    expect(storeB.getState().moduleContexts.size).toBe(0);
    expect(storeA.getState().moduleContexts.get("api-client")).toEqual({ marker: "A" });
  });
});
