import { describe, expect, test } from "vitest";
import { clampSplitRatio } from "./StackedSplit";

describe("clampSplitRatio", () => {
  test("passes values inside the 25%-75% range through unchanged", () => {
    expect(clampSplitRatio(0.45)).toBe(0.45);
    expect(clampSplitRatio(0.25)).toBe(0.25);
    expect(clampSplitRatio(0.75)).toBe(0.75);
  });

  test("clamps below the 25% floor", () => {
    expect(clampSplitRatio(0)).toBe(0.25);
    expect(clampSplitRatio(0.1)).toBe(0.25);
  });

  test("clamps above the 75% ceiling", () => {
    expect(clampSplitRatio(1)).toBe(0.75);
    expect(clampSplitRatio(0.9)).toBe(0.75);
  });
});
