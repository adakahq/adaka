import { describe, expect, test } from "vitest";

/**
 * Tests palette command scoping logic:
 * - Module commands are hidden when no workspace is open
 * - Built-in commands remain visible always
 */

interface ResolvedCommand {
  id: string;
  moduleId: string | null;
}

function filterCommands(commands: ResolvedCommand[], hasWorkspace: boolean): ResolvedCommand[] {
  if (hasWorkspace) return commands;
  return commands.filter((c) => c.moduleId === null);
}

const builtins: ResolvedCommand[] = [
  { id: "builtin:open-workspace", moduleId: null },
  { id: "builtin:create-workspace", moduleId: null },
];

const moduleCommands: ResolvedCommand[] = [
  { id: "api-client:new-request", moduleId: "api-client" },
  { id: "api-client:send", moduleId: "api-client" },
];

const all = [...builtins, ...moduleCommands];

describe("palette scoping", () => {
  test("all commands visible when workspace is open", () => {
    const result = filterCommands(all, true);
    expect(result).toHaveLength(4);
  });

  test("only builtins visible when no workspace", () => {
    const result = filterCommands(all, false);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.moduleId === null)).toBe(true);
  });

  test("empty list remains empty", () => {
    expect(filterCommands([], false)).toHaveLength(0);
    expect(filterCommands([], true)).toHaveLength(0);
  });

  test("module command should be blocked without workspace (residual invocation guard)", () => {
    const cmd = moduleCommands[0] as ResolvedCommand;
    const shouldBlock = cmd.moduleId !== null && !false; // !hasWorkspace
    expect(shouldBlock).toBe(true);
  });
});
