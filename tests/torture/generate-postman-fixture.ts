/**
 * Generates a Postman Collection v2.1 JSON with 500 requests across 40 folders.
 * Run: npx tsx tests/torture/generate-postman-fixture.ts > tests/torture/fixture-500.json
 * NOT checked in — the CI/test script generates it fresh each run.
 */

const TOTAL_REQUESTS = 500;
const TOTAL_FOLDERS = 40;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const CONTENT_TYPES = ["application/json", "text/plain", "application/xml", "multipart/form-data"];

function randomMethod(): string {
  return METHODS[Math.floor(Math.random() * METHODS.length)]!;
}

function randomString(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: {
    method: string;
    url: { raw: string; query?: { key: string; value: string }[] };
    header?: { key: string; value: string; disabled?: boolean }[];
    body?: { mode: string; raw?: string; options?: { raw: { language: string } } };
  };
}

function generateRequest(index: number): PostmanItem {
  const method = randomMethod();
  const name = `request-${index}-${randomString(8)}`;
  const url = `https://api.example.com/v${Math.ceil(Math.random() * 3)}/${randomString(6)}/${randomString(4)}`;

  const headers = Array.from({ length: Math.floor(Math.random() * 5) }, (_, i) => ({
    key: `X-Header-${i}-${randomString(4)}`,
    value: randomString(12),
    ...(Math.random() > 0.8 ? { disabled: true } : {}),
  }));

  const query = Array.from({ length: Math.floor(Math.random() * 4) }, (_, i) => ({
    key: `param${i}`,
    value: randomString(8),
  }));

  const item: PostmanItem = {
    name,
    request: {
      method,
      url: { raw: url, ...(query.length ? { query } : {}) },
      ...(headers.length ? { header: headers } : {}),
    },
  };

  if (["POST", "PUT", "PATCH"].includes(method) && Math.random() > 0.3) {
    const ct = CONTENT_TYPES[Math.floor(Math.random() * CONTENT_TYPES.length)]!;
    if (ct === "application/json") {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < Math.floor(Math.random() * 8) + 1; i++) {
        obj[randomString(6)] = Math.random() > 0.5 ? randomString(20) : Math.floor(Math.random() * 1000);
      }
      item.request!.body = {
        mode: "raw",
        raw: JSON.stringify(obj),
        options: { raw: { language: "json" } },
      };
    } else {
      item.request!.body = { mode: "raw", raw: randomString(50) };
    }
  }

  return item;
}

function generateFolder(index: number, requests: PostmanItem[]): PostmanItem {
  return {
    name: `folder-${index}-${randomString(6)}`,
    item: requests,
  };
}

function generate() {
  const folders: PostmanItem[] = [];
  const requestsPerFolder = Math.ceil(TOTAL_REQUESTS / TOTAL_FOLDERS);
  let requestIndex = 0;

  for (let f = 0; f < TOTAL_FOLDERS; f++) {
    const count = f < TOTAL_FOLDERS - 1
      ? requestsPerFolder
      : TOTAL_REQUESTS - requestIndex;
    const requests: PostmanItem[] = [];
    for (let r = 0; r < count && requestIndex < TOTAL_REQUESTS; r++, requestIndex++) {
      requests.push(generateRequest(requestIndex));
    }
    folders.push(generateFolder(f, requests));
  }

  const collection = {
    info: {
      name: "Torture Test Collection (500 requests)",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: folders,
    variable: [
      { key: "BASE_URL", value: "https://api.example.com" },
      { key: "TOKEN", value: "test-token-value" },
    ],
  };

  console.log(JSON.stringify(collection, null, 2));
}

generate();
