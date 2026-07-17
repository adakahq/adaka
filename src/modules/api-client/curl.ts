import type { CurlParseResult, RequestFile } from "./types";

/**
 * Detect whether pasted text looks like a curl command.
 * Used by the URL bar to intercept pastes and route them to the Rust parser.
 */
export function isCurlCommand(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("curl ") ||
    trimmed.startsWith("curl\t") ||
    trimmed === "curl"
  );
}

/**
 * Convert a parsed cURL result into a partial RequestFile update.
 */
export function curlResultToRequestUpdate(result: CurlParseResult): Partial<RequestFile> {
  const update: Partial<RequestFile> = {
    method: result.method,
    url: result.url,
    headers: result.headers,
  };

  if (result.body) {
    update.body = {
      type: result.body_type,
      content: result.body,
    };
  } else {
    update.body = { type: "none" };
  }

  return update;
}
