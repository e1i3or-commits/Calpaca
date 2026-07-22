import { describe, expect, test } from "bun:test";
import { generateToken } from "../../src/lib/id";

describe("generateToken", () => {
  test("is URL-safe", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("generates unique tokens across many calls", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(tokens.size).toBe(1000);
  });

  test("contains a UUID prefix and a random suffix", () => {
    const token = generateToken();
    const uuid = token.slice(0, 36);
    const separator = token.slice(36, 37);
    const suffix = token.slice(37);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(separator).toBe("-");
    expect(suffix.length).toBeGreaterThan(0);
  });
});
