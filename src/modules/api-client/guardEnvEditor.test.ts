import { describe, expect, test, vi } from "vitest";

/**
 * Tests the guard logic extracted from ApiClientRoute.guardEnvEditor.
 * The guard is a pure function of (dirty, confirm, proceed) — we replicate
 * the logic here to test without rendering React.
 */

interface ConfirmOpts {
  title: string;
  detail: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => void;
}

function makeGuard(dirty: boolean, envName: string | null, confirm: (opts: ConfirmOpts) => void) {
  return (proceed: () => void) => {
    if (!dirty) {
      proceed();
      return;
    }
    confirm({
      title: "Unsaved environment changes",
      detail: `You have unsaved changes to ${envName ?? "the environment"}.toml. Discard them?`,
      confirmLabel: "Discard",
      destructive: true,
      onConfirm: () => {
        proceed();
      },
    });
  };
}

describe("guardEnvEditor", () => {
  test("calls proceed immediately when not dirty", () => {
    const proceed = vi.fn();
    const confirm = vi.fn();
    const guard = makeGuard(false, "local", confirm);
    guard(proceed);
    expect(proceed).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("shows confirm and does NOT call proceed when dirty", () => {
    const proceed = vi.fn();
    const confirm = vi.fn();
    const guard = makeGuard(true, "staging", confirm);
    guard(proceed);
    expect(proceed).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    const opts = confirm.mock.calls[0] as unknown as [ConfirmOpts];
    expect(opts[0]).toMatchObject({
      title: "Unsaved environment changes",
      confirmLabel: "Discard",
      destructive: true,
    });
    expect(opts[0].detail).toContain("staging");
  });

  test("proceed fires when user confirms discard", () => {
    const proceed = vi.fn();
    const confirm = vi.fn();
    const guard = makeGuard(true, "local", confirm);
    guard(proceed);
    expect(proceed).not.toHaveBeenCalled();
    // Simulate user clicking Discard
    const calls = confirm.mock.calls[0] as unknown as [ConfirmOpts];
    calls[0].onConfirm();
    expect(proceed).toHaveBeenCalledOnce();
  });

  test("uses fallback name when envName is null", () => {
    const proceed = vi.fn();
    const confirm = vi.fn();
    const guard = makeGuard(true, null, confirm);
    guard(proceed);
    const calls = confirm.mock.calls[0] as unknown as [ConfirmOpts];
    expect(calls[0].detail).toContain("the environment");
  });
});
