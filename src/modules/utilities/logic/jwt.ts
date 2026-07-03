export interface JwtDecoded {
  header: unknown;
  payload: unknown;
  exp?: number;
  error?: string;
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwt(token: string): JwtDecoded {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { header: null, payload: null, error: "Not a valid JWT (expected 3 dot-separated parts)" };
  }

  const headerPart = parts[0] ?? "";
  const payloadPart = parts[1] ?? "";

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64UrlDecode(headerPart));
  } catch {
    return { header: null, payload: null, error: "Failed to decode JWT header" };
  }
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    return { header: null, payload: null, error: "Failed to decode JWT payload" };
  }

  const exp =
    payload != null &&
    typeof payload === "object" &&
    "exp" in payload &&
    typeof (payload as Record<string, unknown>).exp === "number"
      ? ((payload as Record<string, unknown>).exp as number)
      : undefined;

  return { header, payload, exp };
}
