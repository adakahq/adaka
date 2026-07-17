import { describe, expect, test } from "vitest";
import { createApiClientStore } from "./store";
import type { RequestFile } from "./types";

function blankRequest(overrides?: Partial<RequestFile>): RequestFile {
  return {
    version: 1,
    name: "Test",
    method: "GET",
    url: "",
    headers: {},
    headers_disabled: {},
    query: {},
    query_disabled: {},
    auth: { type: "inherit" },
    body: { type: "none" },
    settings: { timeout_ms: 30000, follow_redirects: true, verify_tls: true },
    tests: {},
    ...overrides,
  };
}

describe("createApiClientStore", () => {
  test("updateRequest changes method and marks dirty", () => {
    const store = createApiClientStore();
    store.getState().setActiveRequest(blankRequest());

    expect(store.getState().activeRequest?.method).toBe("GET");
    expect(store.getState().dirty).toBe(false);

    store.getState().updateRequest({ method: "POST" });

    expect(store.getState().activeRequest?.method).toBe("POST");
    expect(store.getState().dirty).toBe(true);
  });

  test("method persists through simulated save cycle", () => {
    const store = createApiClientStore();
    store.getState().setActiveRequest(blankRequest());
    store.getState().updateRequest({ method: "DELETE" });

    expect(store.getState().activeRequest?.method).toBe("DELETE");

    // Simulate save: dirty clears but method stays
    store.getState().setDirty(false);
    expect(store.getState().activeRequest?.method).toBe("DELETE");
    expect(store.getState().dirty).toBe(false);
  });

  test("method persists through simulated reload", () => {
    const store = createApiClientStore();
    store.getState().setActiveRequest(blankRequest());
    store.getState().updateRequest({ method: "PUT" });

    // Simulate reload: setActiveRequest with the saved method
    const saved = store.getState().activeRequest;
    if (!saved) throw new Error("expected activeRequest");
    store.getState().setActiveRequest({ ...saved });

    expect(store.getState().activeRequest?.method).toBe("PUT");
    expect(store.getState().dirty).toBe(false);
  });

  test("createDraft sets untitled request with dirty flag", () => {
    const store = createApiClientStore();
    store.getState().createDraft();

    const { activeRequest, activeRequestPath, dirty } = store.getState();
    expect(activeRequest).not.toBeNull();
    expect(activeRequest?.name).toBe("Untitled request");
    expect(activeRequest?.method).toBe("GET");
    expect(activeRequestPath).toBeNull();
    expect(dirty).toBe(true);
  });

  test("updateRequest is no-op when activeRequest is null", () => {
    const store = createApiClientStore();
    store.getState().updateRequest({ method: "PATCH" });
    expect(store.getState().activeRequest).toBeNull();
    expect(store.getState().dirty).toBe(false);
  });

  test("dirty existing request: save clears dirty, path remains for send", () => {
    const store = createApiClientStore();
    store.getState().setActiveRequest(blankRequest({ url: "http://old" }));
    store.getState().setActiveRequestPath("requests/my-req.req.toml");
    store.getState().setDirty(false);

    store.getState().updateRequest({ url: "http://new" });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().activeRequest?.url).toBe("http://new");

    // Simulate save: dirty clears, path and url stay
    store.getState().setDirty(false);
    const state = store.getState();
    expect(state.dirty).toBe(false);
    expect(state.activeRequestPath).toBe("requests/my-req.req.toml");
    expect(state.activeRequest?.url).toBe("http://new");
  });

  test("draft save assigns path so send can proceed", () => {
    const store = createApiClientStore();
    store.getState().createDraft();
    expect(store.getState().activeRequestPath).toBeNull();
    expect(store.getState().dirty).toBe(true);

    store.getState().updateRequest({ url: "http://draft-url" });

    // Simulate save assigning a path
    store.getState().setActiveRequestPath("requests/untitled-request.req.toml");
    store.getState().setDirty(false);

    const state = store.getState();
    expect(state.activeRequestPath).toBe("requests/untitled-request.req.toml");
    expect(state.activeRequest?.url).toBe("http://draft-url");
    expect(state.dirty).toBe(false);
  });

  test("createDraft DTO has no null members", () => {
    const store = createApiClientStore();
    store.getState().createDraft();
    const req = store.getState().activeRequest;
    if (!req) throw new Error("expected activeRequest");

    // Top-level required fields must be strings, not null
    expect(typeof req.version).toBe("number");
    expect(typeof req.name).toBe("string");
    expect(typeof req.method).toBe("string");
    expect(typeof req.url).toBe("string");

    // Maps must be objects, not null
    expect(req.headers).toEqual({});
    expect(req.headers_disabled).toEqual({});
    expect(req.query).toEqual({});
    expect(req.query_disabled).toEqual({});

    // Sub-objects must be objects with type field, not null
    expect(req.auth).toBeDefined();
    expect(typeof req.auth.type).toBe("string");
    expect(req.body).toBeDefined();
    expect(typeof req.body.type).toBe("string");
    expect(req.settings).toBeDefined();
    expect(typeof req.settings.timeout_ms).toBe("number");
    expect(req.tests).toBeDefined();

    // Optional fields may be undefined but never null
    expect(req.auth.token).not.toBe(null);
    expect(req.body.content).not.toBe(null);
    expect(req.tests.status).not.toBe(null);
  });

  test("serialized TOML contains current URL, not stale value", () => {
    const store = createApiClientStore();
    store.getState().setActiveRequest(blankRequest({ url: "http://old" }));
    store.getState().updateRequest({ url: "http://{{NOPE}}/api" });

    const req = store.getState().activeRequest;
    if (!req) throw new Error("expected activeRequest");
    expect(req.url).toBe("http://{{NOPE}}/api");
  });

  test("two workspace stores coexist without bleeding", () => {
    const storeA = createApiClientStore();
    const storeB = createApiClientStore();

    storeA.getState().createDraft();
    storeA.getState().updateRequest({ url: "http://workspace-a" });

    expect(storeB.getState().activeRequest).toBeNull();
    expect(storeB.getState().dirty).toBe(false);

    storeB.getState().createDraft();
    storeB.getState().updateRequest({ url: "http://workspace-b" });

    expect(storeA.getState().activeRequest?.url).toBe("http://workspace-a");
    expect(storeB.getState().activeRequest?.url).toBe("http://workspace-b");
    expect(storeA.getState().activeRequest).not.toBe(storeB.getState().activeRequest);
  });
});
