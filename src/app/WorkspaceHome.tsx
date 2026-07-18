import { getModules } from "../shared/module-sdk";
import { useShellStore } from "./store";

interface CardDef {
  moduleId: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const CARDS: CardDef[] = [
  {
    moduleId: "api-client",
    title: "Test an API",
    subtitle: "Send requests, inspect responses, save to files",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
    ),
  },
  {
    moduleId: "utilities",
    title: "Developer tools",
    subtitle: "Encode, decode, format, and convert",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
      </svg>
    ),
  },
];

export function WorkspaceHome() {
  const workspace = useShellStore((s) => s.workspace);
  const moduleContexts = useShellStore((s) => s.moduleContexts);

  const modules = getModules();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-adaka-text">{workspace.name}</h1>
        <p className="mt-1 text-sm text-adaka-muted">
          What would you like to do?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CARDS.map((card) => {
          const mod = modules.find((m) => m.id === card.moduleId);
          if (!mod) return null;
          const ctx = moduleContexts.get(mod.id);
          const firstRoute = mod.routes[0];
          return (
            <button
              key={card.moduleId}
              className="group flex items-start gap-4 rounded-lg border border-adaka-border bg-adaka-chrome px-6 py-5 text-left transition-colors hover:border-adaka-gold/50 hover:bg-adaka-border/50"
              onClick={() => {
                if (ctx && firstRoute) {
                  ctx.ui.openTab(firstRoute.path);
                }
              }}
            >
              <div className="mt-0.5 text-adaka-muted group-hover:text-adaka-gold">
                {card.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-adaka-text">{card.title}</p>
                <p className="mt-0.5 text-xs text-adaka-faint">{card.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-adaka-faint">
        <span>
          <kbd className="rounded border border-adaka-border px-1.5 py-0.5 text-[10px] text-adaka-muted">
            Ctrl+K
          </kbd>{" "}
          command palette
        </span>
        <span>
          <kbd className="rounded border border-adaka-border px-1.5 py-0.5 text-[10px] text-adaka-muted">
            Ctrl+/
          </kbd>{" "}
          shortcuts
        </span>
      </div>
    </div>
  );
}
