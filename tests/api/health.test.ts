import { describe, expect, test } from "bun:test";
import { app } from "../../src/api/app";
import { CALPACA_VERSION } from "../../src/version";

describe("GET /health", () => {
  test("returns ok: true", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("reports the running application version separately", async () => {
    const res = await app.request("/version");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: CALPACA_VERSION });
  });
});
