import { describe, expect, test } from "vitest";
import { visibleToasts } from "./Toasts";
import type { Toast } from "./global-store";

function toast(id: number, kind: Toast["kind"] = "info"): Toast {
  return { id, msg: `toast ${id}`, kind };
}

describe("visibleToasts", () => {
  test("returns all toasts when at or under the max", () => {
    const toasts = [toast(1), toast(2)];
    expect(visibleToasts(toasts)).toEqual(toasts);
  });

  test("caps at 3 by default, keeping the most recent", () => {
    const toasts = [toast(1), toast(2), toast(3), toast(4), toast(5)];
    expect(visibleToasts(toasts).map((t) => t.id)).toEqual([3, 4, 5]);
  });

  test("respects a custom max", () => {
    const toasts = [toast(1), toast(2), toast(3)];
    expect(visibleToasts(toasts, 1).map((t) => t.id)).toEqual([3]);
  });
});
