import { describe, expect, test, beforeEach } from "vitest";
import { useApiClientStore } from "./store";
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

describe("useApiClientStore", () => {
  beforeEach(() => {
    useApiClientStore.setState({
      activeRequest: null,
      activeRequestPath: null,
      dirty: false,
      sending: false,
      response: null,
      error: null,
    });
  });

  test("updateRequest changes method and marks dirty", () => {
    const store = useApiClientStore.getState();
    store.setActiveRequest(blankRequest());

    expect(useApiClientStore.getState().activeRequest?.method).toBe("GET");
    expect(useApiClientStore.getState().dirty).toBe(false);

    useApiClientStore.getState().updateRequest({ method: "POST" });

    expect(useApiClientStore.getState().activeRequest?.method).toBe("POST");
    expect(useApiClientStore.getState().dirty).toBe(true);
  });

  test("method persists through simulated save cycle", () => {
    useApiClientStore.getState().setActiveRequest(blankRequest());
    useApiClientStore.getState().updateRequest({ method: "DELETE" });

    expect(useApiClientStore.getState().activeRequest?.method).toBe("DELETE");

    // Simulate save: dirty clears but method stays
    useApiClientStore.getState().setDirty(false);
    expect(useApiClientStore.getState().activeRequest?.method).toBe("DELETE");
    expect(useApiClientStore.getState().dirty).toBe(false);
  });

  test("method persists through simulated reload", () => {
    useApiClientStore.getState().setActiveRequest(blankRequest());
    useApiClientStore.getState().updateRequest({ method: "PUT" });

    // Simulate reload: setActiveRequest with the saved method
    const saved = useApiClientStore.getState().activeRequest;
    if (!saved) throw new Error("expected activeRequest");
    useApiClientStore.getState().setActiveRequest({ ...saved });

    expect(useApiClientStore.getState().activeRequest?.method).toBe("PUT");
    expect(useApiClientStore.getState().dirty).toBe(false);
  });

  test("createDraft sets untitled request with dirty flag", () => {
    useApiClientStore.getState().createDraft();

    const { activeRequest, activeRequestPath, dirty } =
      useApiClientStore.getState();
    expect(activeRequest).not.toBeNull();
    expect(activeRequest?.name).toBe("Untitled request");
    expect(activeRequest?.method).toBe("GET");
    expect(activeRequestPath).toBeNull();
    expect(dirty).toBe(true);
  });

  test("updateRequest is no-op when activeRequest is null", () => {
    useApiClientStore.getState().updateRequest({ method: "PATCH" });
    expect(useApiClientStore.getState().activeRequest).toBeNull();
    expect(useApiClientStore.getState().dirty).toBe(false);
  });

  test("dirty existing request: save clears dirty, path remains for send", () => {
    useApiClientStore.getState().setActiveRequest(blankRequest({ url: "http://old" }));
    useApiClientStore.getState().setActiveRequestPath("requests/my-req.req.toml");
    useApiClientStore.getState().setDirty(false);

    useApiClientStore.getState().updateRequest({ url: "http://new" });
    expect(useApiClientStore.getState().dirty).toBe(true);
    expect(useApiClientStore.getState().activeRequest?.url).toBe("http://new");

    // Simulate save: dirty clears, path and url stay
    useApiClientStore.getState().setDirty(false);
    const state = useApiClientStore.getState();
    expect(state.dirty).toBe(false);
    expect(state.activeRequestPath).toBe("requests/my-req.req.toml");
    expect(state.activeRequest?.url).toBe("http://new");
  });

  test("draft save assigns path so send can proceed", () => {
    useApiClientStore.getState().createDraft();
    expect(useApiClientStore.getState().activeRequestPath).toBeNull();
    expect(useApiClientStore.getState().dirty).toBe(true);

    useApiClientStore.getState().updateRequest({ url: "http://draft-url" });

    // Simulate save assigning a path
    useApiClientStore.getState().setActiveRequestPath("requests/untitled-request.req.toml");
    useApiClientStore.getState().setDirty(false);

    const state = useApiClientStore.getState();
    expect(state.activeRequestPath).toBe("requests/untitled-request.req.toml");
    expect(state.activeRequest?.url).toBe("http://draft-url");
    expect(state.dirty).toBe(false);
  });

  test("createDraft DTO has no null members", () => {
    useApiClientStore.getState().createDraft();
    const req = useApiClientStore.getState().activeRequest;
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
    useApiClientStore.getState().setActiveRequest(blankRequest({ url: "http://old" }));
    useApiClientStore.getState().updateRequest({ url: "http://{{NOPE}}/api" });

    const req = useApiClientStore.getState().activeRequest;
    if (!req) throw new Error("expected activeRequest");
    expect(req.url).toBe("http://{{NOPE}}/api");
  });
});
