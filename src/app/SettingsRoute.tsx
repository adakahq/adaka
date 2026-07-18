import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "./settings-store";
import { useGlobalStore, type Theme } from "./global-store";
import { useShellStore } from "./store";
import { SHORTCUTS, formatKey } from "../shared/shortcuts";
import { Toggle } from "../shared/Toggle";

type Section = "general" | "appearance" | "shortcuts" | "about";

/** Set once a sponsor account (GitHub Sponsors / Open Collective / etc.)
 * exists — see .github/FUNDING.yml. Empty means "not live yet", so the
 * About page renders the row disabled rather than linking nowhere. */
const FUNDING_URL = "";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

function Row({
  title,
  detail,
  onClick,
  children,
}: {
  title: string;
  detail?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="text-sm text-adaka-text">{title}</p>
        {detail && <p className="mt-0.5 text-xs text-adaka-faint">{detail}</p>}
      </div>
      {children}
    </div>
  );
}

function GeneralSection() {
  const folder = useSettingsStore((s) => s.defaultWorkspaceFolder);
  const setFolder = useSettingsStore((s) => s.setDefaultWorkspaceFolder);
  const reopen = useSettingsStore((s) => s.reopenLastSession);
  const setReopen = useSettingsStore((s) => s.setReopenLastSession);

  return (
    <div className="divide-y divide-adaka-border">
      <Row
        title="Default workspace folder"
        detail={folder || "Documents/Adaka (built-in default)"}
      >
        <div className="flex shrink-0 gap-1.5">
          <button
            className="rounded border border-adaka-border-strong px-2.5 py-1 text-xs text-adaka-text hover:border-adaka-muted"
            onClick={() => {
              void openDialog({ directory: true, multiple: false }).then((selected) => {
                if (typeof selected === "string") void setFolder(selected);
              });
            }}
          >
            Browse…
          </button>
          {folder && (
            <button
              className="rounded border border-adaka-border-strong px-2.5 py-1 text-xs text-adaka-muted hover:border-adaka-muted hover:text-adaka-text"
              onClick={() => void setFolder("")}
            >
              Reset
            </button>
          )}
        </div>
      </Row>
      <Row
        title="Reopen last session"
        detail="Restore your open workspace tabs when Adaka starts"
        onClick={() => void setReopen(!reopen)}
      >
        <Toggle checked={reopen} onChange={(v) => void setReopen(v)} label="Reopen last session" />
      </Row>
    </div>
  );
}

function AppearanceSection() {
  const theme = useGlobalStore((s) => s.theme);
  const setTheme = useGlobalStore((s) => s.setTheme);
  const railDefault = useSettingsStore((s) => s.railCollapsedDefault);
  const setRailDefault = useSettingsStore((s) => s.setRailCollapsedDefault);
  const setRailCollapsed = useShellStore((s) => s.setRailCollapsed);

  const pick = (t: Theme) => {
    if (t === "light") return; // coming soon, not wired to anything
    setTheme(t);
  };

  return (
    <div className="divide-y divide-adaka-border">
      <Row title="Theme" detail="Light mode is on the roadmap">
        <div className="flex gap-1.5">
          <button
            className={`rounded border px-2.5 py-1 text-xs ${
              theme === "dark"
                ? "border-adaka-gold text-adaka-gold"
                : "border-adaka-border-strong text-adaka-text hover:border-adaka-muted"
            }`}
            onClick={() => pick("dark")}
          >
            Dark
          </button>
          <button
            disabled
            title="Light theme — coming soon"
            className="cursor-not-allowed rounded border border-adaka-border px-2.5 py-1 text-xs text-adaka-faint"
          >
            Light
          </button>
        </div>
      </Row>
      <Row
        title="Rail collapsed by default"
        detail="New workspace tabs open with the module rail collapsed"
        onClick={() => {
          void setRailDefault(!railDefault);
          setRailCollapsed(!railDefault);
        }}
      >
        <Toggle
          checked={railDefault}
          onChange={(v) => {
            void setRailDefault(v);
            setRailCollapsed(v);
          }}
          label="Rail collapsed by default"
        />
      </Row>
    </div>
  );
}

function ShortcutsSection() {
  const groups = [
    { label: "Global", shortcuts: SHORTCUTS.filter((s) => s.scope === "global") },
    { label: "API Client", shortcuts: SHORTCUTS.filter((s) => s.scope === "api-client") },
    { label: "Utilities", shortcuts: SHORTCUTS.filter((s) => s.scope === "utilities") },
  ];

  return (
    <div>
      <p className="mb-3 text-xs text-adaka-faint">
        Read-only — press <kbd className="rounded border border-adaka-border px-1 text-adaka-muted">Ctrl+/</kbd>{" "}
        anywhere to bring this list up as an overlay.
      </p>
      {groups.map((g) => (
        <div key={g.label} className="mb-4 last:mb-0">
          <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-adaka-faint">
            {g.label}
          </h3>
          <div className="divide-y divide-adaka-border">
            {g.shortcuts.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-adaka-text">{s.label}</span>
                <kbd className="rounded border border-adaka-border bg-adaka-chrome px-1.5 py-0.5 text-[10px] text-adaka-muted">
                  {formatKey(s.keys)}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-adaka-gold text-lg font-bold text-adaka-on-gold">
          A
        </div>
        <div>
          <p className="text-sm font-semibold text-adaka-text">Adaka</p>
          <p className="text-xs text-adaka-faint">{version ? `Version ${version}` : "Loading version…"}</p>
        </div>
      </div>
      <p className="mt-4 max-w-md text-sm text-adaka-muted">
        One local-first desktop workspace replacing the API client, database browser, log
        viewer, mail catcher, and micro-utilities every developer keeps open.
      </p>
      <div className="mt-4 flex gap-4">
        <button
          className="text-xs text-adaka-gold hover:underline"
          onClick={() => void openExternal("https://github.com/adakahq/adaka")}
        >
          GitHub
        </button>
        <button
          className="text-xs text-adaka-gold hover:underline"
          onClick={() => void openExternal("https://github.com/adakahq/adaka/issues/new")}
        >
          Report an issue
        </button>
      </div>
      <div className="mt-4 border-t border-adaka-border pt-4">
        {FUNDING_URL ? (
          <button
            className="flex items-center gap-1.5 text-xs text-adaka-gold hover:underline"
            onClick={() => void openExternal(FUNDING_URL)}
          >
            <HeartIcon className="h-3.5 w-3.5" />
            Support Adaka
          </button>
        ) : (
          <span
            title="Coming soon — no sponsor account yet"
            className="flex cursor-not-allowed items-center gap-1.5 text-xs text-adaka-faint"
          >
            <HeartIcon className="h-3.5 w-3.5" />
            Support Adaka
          </span>
        )}
      </div>
    </div>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21s-6.7-4.35-9.33-8.02C1.02 10.9 1 8.5 2.64 6.86a5 5 0 0 1 7.07 0L12 9.17l2.29-2.3a5 5 0 0 1 7.07 0c1.64 1.64 1.62 4.04-.03 6.12C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

export function SettingsRoute() {
  const [section, setSection] = useState<Section>("general");

  useEffect(() => {
    void useSettingsStore.getState().load();
  }, []);

  return (
    <div className="flex h-full">
      <div className="w-44 shrink-0 border-r border-adaka-border bg-adaka-chrome py-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`block w-full px-3 py-1.5 text-left text-sm ${
              section === s.id
                ? "border-l-2 border-l-adaka-gold bg-adaka-border/50 text-adaka-text"
                : "border-l-2 border-l-transparent text-adaka-muted hover:bg-adaka-border/30 hover:text-adaka-text"
            }`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-lg">
          <h2 className="mb-4 text-sm font-semibold text-adaka-text">
            {SECTIONS.find((s) => s.id === section)?.label}
          </h2>
          {section === "general" && <GeneralSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "shortcuts" && <ShortcutsSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
