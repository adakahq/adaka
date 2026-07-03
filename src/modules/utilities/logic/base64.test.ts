import { describe, it, expect } from "vitest";
import { base64Encode, base64Decode } from "./base64";

describe("base64 standard", () => {
  it("round-trips ASCII", () => {
    const input = "hello world";
    expect(base64Decode(base64Encode(input, false), false)).toBe(input);
  });

  it("round-trips emoji", () => {
    const input = "hello 🌍🎉";
    expect(base64Decode(base64Encode(input, false), false)).toBe(input);
  });

  it("round-trips Twi text with diacritics", () => {
    const input = "Ɛte sɛn? Mepɛ Adaka paa!";
    expect(base64Decode(base64Encode(input, false), false)).toBe(input);
  });

  it("round-trips mixed multibyte", () => {
    const input = "café ☕ naïve résumé — 日本語テスト";
    expect(base64Decode(base64Encode(input, false), false)).toBe(input);
  });
});

describe("base64 URL-safe", () => {
  it("encodes without + / = characters", () => {
    const encoded = base64Encode("subjects?_d", true);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("round-trips with URL-safe flag", () => {
    const input = "hello 🌍";
    expect(base64Decode(base64Encode(input, true), true)).toBe(input);
  });
});
