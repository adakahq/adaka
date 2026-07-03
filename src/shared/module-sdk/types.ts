export type IconName =
  | "globe"
  | "wrench"
  | "mail"
  | "database"
  | "terminal"
  | "puzzle";

export interface ModuleRoute {
  path: string;
  label: string;
  component: React.ComponentType;
}

export interface PaletteCommand {
  id: string;
  label: string;
  keywords?: string[];
  action: () => void;
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

export type ToastKind = "info" | "error";

export interface ModuleContext {
  workspace: WorkspaceInfo;
  env: {
    active(): string;
    resolve(template: string): Promise<string>;
  };
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  events: {
    emit(topic: string, payload: unknown): Promise<void>;
    on(topic: string, handler: (event: unknown) => void): Promise<() => void>;
  };
  ui: {
    toast(msg: string, kind?: ToastKind): void;
    openTab(route: string): void;
  };
}

export interface AdakaModule {
  id: string;
  name: string;
  icon: IconName;
  routes: ModuleRoute[];
  commands: PaletteCommand[];
  onWorkspaceOpen?(ctx: ModuleContext): void | Promise<void>;
  onWorkspaceClose?(): void | Promise<void>;
}
