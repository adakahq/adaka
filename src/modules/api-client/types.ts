export interface TreeNodeFolder {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

export interface TreeNodeRequest {
  type: "request";
  name: string;
  path: string;
  method: string;
}

export type TreeNode = TreeNodeFolder | TreeNodeRequest;

export interface RequestFile {
  version: number;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  headers_disabled: Record<string, string>;
  query: Record<string, string>;
  query_disabled: Record<string, string>;
  auth: AuthConfig;
  body: BodyConfig;
  settings: RequestSettings;
  tests: TestsConfig;
}

export interface AuthConfig {
  type: string;
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  in?: string;
}

export interface BodyConfig {
  type: string;
  content?: string;
  content_type?: string;
  fields?: FormField[];
}

export interface FormField {
  name: string;
  value: string;
  enabled: boolean;
}

export interface RequestSettings {
  timeout_ms: number;
  follow_redirects: boolean;
  verify_tls: boolean;
}

export interface TestsConfig {
  status?: number;
}

export interface SendResponse {
  request_id: string;
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  body_size: number;
  truncated: boolean;
  binary: boolean;
  timing: TimingInfo;
  url_resolved: string;
  method: string;
}

export interface TimingInfo {
  total_ms: number;
  first_byte_ms: number;
  dns_ms: number;
  connect_ms: number;
  tls_ms: number;
  download_ms: number;
}

export interface StructuredError {
  code: string;
  message: string;
}

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export const METHOD_COLORS: Record<string, string> = {
  GET: "text-teal-400",
  POST: "text-amber-400",
  PUT: "text-blue-400",
  PATCH: "text-purple-400",
  DELETE: "text-red-400",
  HEAD: "text-adaka-muted",
  OPTIONS: "text-adaka-muted",
};
