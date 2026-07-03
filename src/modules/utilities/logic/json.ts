export function formatJson(input: string): string {
  return JSON.stringify(JSON.parse(input), null, 2);
}

export function minifyJson(input: string): string {
  return JSON.stringify(JSON.parse(input));
}

export interface JsonValidation {
  valid: boolean;
  error?: string;
  position?: { line: number; column: number };
}

export function validateJson(input: string): JsonValidation {
  try {
    JSON.parse(input);
    return { valid: true };
  } catch (e) {
    const msg = e instanceof SyntaxError ? e.message : String(e);
    const pos = parseErrorPosition(msg, input);
    return { valid: false, error: msg, position: pos };
  }
}

export function parseErrorPosition(
  errorMsg: string,
  input: string,
): { line: number; column: number } | undefined {
  const posMatch = errorMsg.match(/position\s+(\d+)/i);
  if (!posMatch?.[1]) return undefined;
  const pos = parseInt(posMatch[1], 10);
  if (isNaN(pos) || pos < 0 || pos > input.length) return undefined;
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < input.length; i++) {
    if (input[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}
