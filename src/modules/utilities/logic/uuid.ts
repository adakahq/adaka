export function generateUuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateUlid(): string {
  const now = Date.now();
  let ts = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[t % 32] + ts;
    t = Math.floor(t / 32);
  }

  const rand = crypto.getRandomValues(new Uint8Array(10));
  let r = "";
  for (let i = 0; i < 16; i++) {
    const byteIdx = Math.floor((i * 5) / 8);
    const bitOffset = (i * 5) % 8;
    const byte0 = rand[byteIdx] ?? 0;
    const byte1 = rand[byteIdx + 1] ?? 0;
    const combined = (byte0 << 8) | byte1;
    const shift = 16 - bitOffset - 5;
    const val = (combined >> shift) & 0x1f;
    r += CROCKFORD[val] ?? "0";
  }

  return ts + r;
}
