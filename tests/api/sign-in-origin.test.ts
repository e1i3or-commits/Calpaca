import { afterEach, describe, expect, test } from "bun:test";
import { app } from "../../src/api/app";

const priorMode = process.env.CALPACA_DEPLOYMENT_MODE;
const priorAuthUrl = process.env.BETTER_AUTH_URL;

afterEach(() => {
  if (priorMode === undefined) delete process.env.CALPACA_DEPLOYMENT_MODE;
  else process.env.CALPACA_DEPLOYMENT_MODE = priorMode;
  if (priorAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = priorAuthUrl;
});

describe("organizer sign-in origin", () => {
  test("redirects a hosted custom domain to the canonical auth origin", async () => {
    process.env.CALPACA_DEPLOYMENT_MODE = "hosted";
    process.env.BETTER_AUTH_URL = "https://app.calpaca.io";

    const response = await app.request("https://cal.tourscale.com/sign-in?invitation=token", {
      headers: { host: "cal.tourscale.com" },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location"))
      .toBe("https://app.calpaca.io/sign-in?invitation=token");
  });

  test("does not redirect the canonical organizer origin", async () => {
    process.env.CALPACA_DEPLOYMENT_MODE = "hosted";
    process.env.BETTER_AUTH_URL = "https://app.calpaca.io";

    const response = await app.request("https://app.calpaca.io/sign-in", {
      headers: { host: "app.calpaca.io" },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });
});
