import { afterEach, describe, expect, test } from "bun:test";
import { trustedAuthOrigins } from "../../src/auth/index";

const priorAuthUrl = process.env.BETTER_AUTH_URL;
const priorPublicUrl = process.env.PUBLIC_URL;
const priorExtraOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS;

afterEach(() => {
  if (priorAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = priorAuthUrl;
  if (priorPublicUrl === undefined) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = priorPublicUrl;
  if (priorExtraOrigins === undefined) delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  else process.env.BETTER_AUTH_TRUSTED_ORIGINS = priorExtraOrigins;
});

describe("trustedAuthOrigins", () => {
  test("includes canonical configured origins", async () => {
    process.env.BETTER_AUTH_URL = "https://app.calpaca.io";
    process.env.PUBLIC_URL = "https://app.calpaca.io";
    expect(await trustedAuthOrigins()).toEqual(["https://app.calpaca.io"]);
  });

  test("trusts an HTTPS origin only when its hostname is verified", async () => {
    process.env.BETTER_AUTH_URL = "https://app.calpaca.io";
    const verified = await trustedAuthOrigins(
      new Request("https://app.calpaca.io/api/auth/sign-in/social", {
        headers: { origin: "https://cal.tourscale.com" },
      }),
      async (hostname) => hostname === "cal.tourscale.com" ? "workspace-id" : null,
    );
    const unknown = await trustedAuthOrigins(
      new Request("https://app.calpaca.io/api/auth/sign-in/social", {
        headers: { origin: "https://attacker.example" },
      }),
      async () => null,
    );

    expect(verified).toContain("https://cal.tourscale.com");
    expect(unknown).not.toContain("https://attacker.example");
  });

  test("does not trust an insecure non-local origin", async () => {
    expect(await trustedAuthOrigins(
      new Request("http://app.test/api/auth/sign-in/social", {
        headers: { origin: "http://cal.tourscale.com" },
      }),
      async () => "workspace-id",
    )).not.toContain("http://cal.tourscale.com");
  });
});
