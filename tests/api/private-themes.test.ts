import { afterEach, describe, expect, test } from "bun:test";
import { app } from "../../src/api/app";
import { resetPrivateThemeCache } from "../../src/api/private-themes";

const PACK = JSON.stringify([
  {
    name: "acme",
    label: "Acme",
    tokens: { "--primary": "oklch(0.36 0.11 265)", "--radius": "0.75rem" },
  },
]);

function configure(pack: string | undefined): void {
  if (pack === undefined) delete process.env.CALPACA_PRIVATE_THEMES;
  else process.env.CALPACA_PRIVATE_THEMES = pack;
  resetPrivateThemeCache();
}

afterEach(() => configure(undefined));

describe("GET /themes/private.css", () => {
  test("serves the configured token blocks as CSS", async () => {
    configure(PACK);
    const response = await app.request("/themes/private.css");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    const css = await response.text();
    expect(css).toContain(':root[data-theme="acme"]');
    expect(css).toContain("--primary: oklch(0.36 0.11 265);");
  });

  test("is empty when the deployment has no pack", async () => {
    configure(undefined);
    const response = await app.request("/themes/private.css");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  // A bad pack must not take the instance down with it.
  test("a malformed pack degrades to no private themes", async () => {
    configure("{not json");
    const response = await app.request("/themes/private.css");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
