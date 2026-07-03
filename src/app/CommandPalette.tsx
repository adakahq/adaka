import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getModules, type PaletteCommand } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { openWorkspace, createWorkspace } from "./workspace-actions";

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function highlightFuzzy(query: string, text: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let qi = 0;
  let run = "";
  for (let ti = 0; ti < text.length; ti++) {
    const ch = text[ti];
    if (qi < q.length && ch != null && ch.toLowerCase() === q[qi]) {
      if (run) {
        parts.push(run);
        run = "";
      }
      parts.push(
        <span key={ti} className="text-adaka-gold">
          {ch}
        </span>,
      );
      qi++;
    } else {
      run += ch ?? "";
    }
  }
  if (run) parts.push(run);
  return parts;
}

function builtinCommands(): PaletteCommand[] {
  const store = useShellStore.getState();
  const cmds: PaletteCommand[] = [
    {
      id: "builtin:open-workspace",
      label: "Open workspace",
      keywords: ["folder", "project"],
      action: () => void openWorkspace(),
    },
    {
      id: "builtin:create-workspace",
      label: "Create workspace",
      keywords: ["new", "init"],
      action: () => void createWorkspace(),
    },
    {
      id: "builtin:toggle-theme",
      label: `Switch to ${store.theme === "dark" ? "light" : "dark"} mode`,
      keywords: ["theme", "dark", "light"],
      action: () => store.setTheme(store.theme === "dark" ? "light" : "dark"),
    },
  ];

  for (const tab of store.tabs) {
    cmds.push({
      id: `builtin:tab:${tab.id}`,
      label: `Switch to: ${tab.label}`,
      keywords: ["tab", "switch"],
      action: () => store.setActiveTab(tab.id),
    });
  }

  return cmds;
}

export function CommandPalette() {
  const open = useShellStore((s) => s.paletteOpen);
  const setPaletteOpen = useShellStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands = useMemo(() => {
    if (!open) return [];
    const moduleCommands = getModules().flatMap((m) => m.commands);
    return [...builtinCommands(), ...moduleCommands];
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return allCommands;
    return allCommands.filter(
      (c) =>
        fuzzyMatch(query, c.label) ||
        c.keywords?.some((k) => fuzzyMatch(query, k)),
    );
  }, [query, allCommands]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filtered.length]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const run = useCallback(
    (cmd: PaletteCommand) => {
      setPaletteOpen(false);
      cmd.action();
    },
    [setPaletteOpen],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selectedIdx];
        if (cmd) run(cmd);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    },
    [filtered, selectedIdx, run, setPaletteOpen],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-adaka-border-strong bg-adaka-chrome shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full border-b border-adaka-border bg-transparent px-4 py-3 text-sm text-adaka-text outline-none placeholder:text-adaka-faint"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-adaka-faint">No results</p>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`flex w-full items-center px-4 py-2 text-left text-sm ${
                i === selectedIdx
                  ? "bg-adaka-gold text-adaka-on-gold"
                  : "text-adaka-text hover:bg-adaka-border"
              }`}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => run(cmd)}
            >
              {highlightFuzzy(i === selectedIdx ? "" : query, cmd.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
