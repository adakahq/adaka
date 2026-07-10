interface StructuredError {
  code: string;
  message: string;
}

function isStructuredError(e: unknown): e is StructuredError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    typeof (e as StructuredError).code === "string" &&
    typeof (e as StructuredError).message === "string"
  );
}

export function formatError(e: unknown): string {
  if (isStructuredError(e)) {
    return `${e.message} (${e.code})`;
  }
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "string") {
    return e;
  }
  try {
    const json = JSON.stringify(e);
    if (typeof json === "string") return json;
  } catch {
    // fall through
  }
  return String(e);
}
