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
    const saved = useApiClientStore.getState().activeRequest!;
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
});
