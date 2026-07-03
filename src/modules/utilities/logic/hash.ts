export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export async function computeHash(
  input: string,
  algo: HashAlgorithm,
): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest(algo, data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
