export function detectUnit(value: number): "s" | "ms" {
  // Timestamps in seconds are < 1e12 until ~2286; milliseconds are >= 1e12 now.
  return Math.abs(value) < 1e12 ? "s" : "ms";
}

export function parseTimestamp(input: string): number {
  if (!input) throw new Error("Empty input");

  const num = Number(input);
  if (!isNaN(num) && input.trim() !== "") {
    const unit = detectUnit(num);
    return unit === "s" ? num * 1000 : num;
  }

  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.getTime();

  throw new Error(`Cannot parse: "${input}"`);
}

export function formatAll(ms: number): string {
  const d = new Date(ms);
  const s = Math.floor(ms / 1000);
  const lines = [
    `Unix (s):    ${s}`,
    `Unix (ms):   ${ms}`,
    `ISO 8601:    ${d.toISOString()}`,
    `UTC:         ${d.toUTCString()}`,
    `Local:       ${d.toString()}`,
  ];
  return lines.join("\n");
}
