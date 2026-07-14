import { describe, expect, test } from "vitest";
import { validateName } from "./WelcomeScreen";

describe("validateName", () => {
  test("rejects empty string", () => {
    expect(validateName("")).not.toBeNull();
    expect(validateName("   ")).not.toBeNull();
  });

  test("rejects forbidden characters", () => {
    expect(validateName("foo/bar")).not.toBeNull();
    expect(validateName("foo\\bar")).not.toBeNull();
    expect(validateName("foo:bar")).not.toBeNull();
    expect(validateName("foo*bar")).not.toBeNull();
    expect(validateName('foo"bar')).not.toBeNull();
    expect(validateName("foo<bar")).not.toBeNull();
    expect(validateName("foo>bar")).not.toBeNull();
    expect(validateName("foo|bar")).not.toBeNull();
    expect(validateName("foo?bar")).not.toBeNull();
  });

  test("rejects leading dot", () => {
    expect(validateName(".hidden")).not.toBeNull();
  });

  test("rejects trailing dot", () => {
    expect(validateName("trailing.")).not.toBeNull();
  });

  test("trailing spaces are trimmed — name is valid", () => {
    expect(validateName("trailing ")).toBeNull();
  });

  test("rejects names over 100 characters", () => {
    expect(validateName("a".repeat(101))).not.toBeNull();
  });

  test("accepts valid names", () => {
    expect(validateName("my-project")).toBeNull();
    expect(validateName("My Project")).toBeNull();
    expect(validateName("api_tests_v2")).toBeNull();
    expect(validateName("a".repeat(100))).toBeNull();
  });
});
