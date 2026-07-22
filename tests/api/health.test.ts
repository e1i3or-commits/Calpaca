import { describe, expect, test } from "bun:test";
import { app } from "../../src/api/app";

describe("GET /health", () => {
  test("returns ok: true", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
