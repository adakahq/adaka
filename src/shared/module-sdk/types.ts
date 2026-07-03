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

export interface ModuleContext {
  workspace: WorkspaceInfo;
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
