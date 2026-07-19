export type IconName =
  | "globe"
  | "wrench"
  | "mail"
  | "database"
  | "terminal"
  | "puzzle";

/** Props every route component may receive. `routeParam` carries whatever
 * follows the first `:` in the tab's route (e.g. `"env:staging"` → the
 * route matches path `"env"` and the component gets `routeParam="staging"`)
 * — lets one registered route back many tabs (one per env file, per open
 * request, etc.) without a route entry per instance. */
export interface ModuleRouteProps {
  routeParam?: string;
}

export interface ModuleRoute {
  path: string;
  label: string;
  component: React.ComponentType<ModuleRouteProps>;
}

export interface PaletteCommand {
  id: string;
  label: string;
  keywords?: string[];
  action: (ctx: ModuleContext) => void;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  version: number;
  root: string;
  modules: ModuleToggles;
}

export interface ModuleToggles {
  api_client: boolean;
  utilities: boolean;
  mail: boolean;
  db: boolean;
  logs: boolean;
}

export type ToastKind = "info" | "success" | "error";

export interface ConfirmOptions {
  title: string;
  detail: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface ModuleContext {
  workspace: WorkspaceInfo;
  env: {
    active(): string;
    setActive(name: string): void;
    resolve(template: string): Promise<string>;
  };
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  events: {
    emit(topic: string, payload: unknown): Promise<void>;
    on(topic: string, handler: (event: unknown) => void): Promise<() => void>;
  };
  ui: {
    toast(msg: string, kind?: ToastKind): void;
    /** `route` may be `"path"` or `"path:param"` — see ModuleRouteProps.
     * `label` overrides the route's static label (needed when one route
     * backs several tabs, e.g. one per env file). */
    openTab(route: string, label?: string): void;
    confirm(options: ConfirmOptions): void;
    dismissConfirm(): void;
  };
}

export interface PanelAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  action: (ctx: ModuleContext) => void;
}

export interface ContextPanelDef {
  title: string;
  component: React.ComponentType;
  headerActions?: PanelAction[];
  emptyState: { message: string; cta?: string };
}

export interface AdakaModule {
  id: string;
  name: string;
  icon: IconName;
  routes: ModuleRoute[];
  commands: PaletteCommand[];
  contextPanel?: ContextPanelDef;
  onWorkspaceOpen?(ctx: ModuleContext): void | Promise<void>;
  onWorkspaceClose?(): void | Promise<void>;
}
