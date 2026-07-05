/**
 * Parse "key: value" lines from clipboard paste into header/param pairs.
 */
export function parseBulkPaste(text: string): Array<[string, string]> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(":"))
    .map((line) => {
      const idx = line.indexOf(":");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as [
        string,
        string,
      ];
    });
}

/**
 * Extract {{VAR}} placeholders from a template string.
 */
export function extractVarNames(template: string): string[] {
  const vars: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    const name = match[1]?.trim() ?? "";
    if (name && !vars.includes(name)) {
      vars.push(name);
    }
  }
  return vars;
}

/**
 * Merge collection.toml ordering with filesystem nodes.
 * Items in `order` appear first in that sequence; remaining items follow alphabetically.
 */
export function mergeTreeOrder<T extends { name: string }>(
  items: T[],
  order: string[],
): T[] {
  const ordered: T[] = [];
  const remaining: T[] = [];

  for (const slug of order) {
    const found = items.find(
      (item) => slugFromName(item.name) === slug || item.name === slug,
    );
    if (found) ordered.push(found);
  }

  for (const item of items) {
    if (!ordered.includes(item)) {
      remaining.push(item);
    }
  }

  remaining.sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...remaining];
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Format byte size for display.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format milliseconds for display.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Get status code color class.
 */
export function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-400";
  if (status >= 300 && status < 400) return "text-blue-400";
  if (status >= 400 && status < 500) return "text-amber-400";
  return "text-red-400";
}
