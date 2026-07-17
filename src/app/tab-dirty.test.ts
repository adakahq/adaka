import { describe, expect, test } from "vitest";
import { isTabDirty, envNameFromTabId } from "./tab-dirty";

describe("isTabDirty", () => {
  test("the request tab is dirty when apiDirty is true", () => {
    expect(isTabDirty("api-client:main", { apiDirty: true, dirtyEnvs: {} })).toBe(true);
    expect(isTabDirty("api-client:main", { apiDirty: false, dirtyEnvs: {} })).toBe(false);
  });

  test("an env tab is dirty only when its own env name is flagged", () => {
    const dirtyEnvs = { staging: true, local: false };
    expect(isTabDirty("api-client:env:staging", { apiDirty: false, dirtyEnvs })).toBe(true);
    expect(isTabDirty("api-client:env:local", { apiDirty: false, dirtyEnvs })).toBe(false);
    expect(isTabDirty("api-client:env:prod", { apiDirty: false, dirtyEnvs })).toBe(false);
  });

  test("env tab dirtiness is independent of the request tab's dirty flag", () => {
    expect(isTabDirty("api-client:env:staging", { apiDirty: true, dirtyEnvs: { staging: false } })).toBe(
      false,
    );
  });

  test("unknown tab ids are never dirty", () => {
    expect(isTabDirty("utilities:json", { apiDirty: true, dirtyEnvs: { staging: true } })).toBe(false);
  });

  test("envNameFromTabId strips the env tab prefix", () => {
    expect(envNameFromTabId("api-client:env:staging")).toBe("staging");
    expect(envNameFromTabId("api-client:env:local")).toBe("local");
  });
});
