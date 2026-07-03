export function base64Encode(input: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(input);
  const binStr = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  let encoded = btoa(binStr);
  if (urlSafe) {
    encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return encoded;
}

export function base64Decode(input: string, urlSafe: boolean): string {
  let b64 = input;
  if (urlSafe) {
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
  }
  const binStr = atob(b64);
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
