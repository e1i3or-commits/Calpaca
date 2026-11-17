import { expect, test } from "bun:test";
import { isDevLoginEnabled } from "../../src/auth/dev-login";

test("dev login needs the explicit flag and a localhost auth URL", () => {
  expect(isDevLoginEnabled({ CALPACA_DEV_LOGIN: "1", BETTER_AUTH_URL: "http://localhost:3000" })).toBe(true);
  expect(isDevLoginEnabled({ CALPACA_DEV_LOGIN: "1", BETTER_AUTH_URL: "http://127.0.0.1:3200" })).toBe(true);
  for (const env of [
    { BETTER_AUTH_URL: "http://localhost:3000" },
    { CALPACA_DEV_LOGIN: "true", BETTER_AUTH_URL: "http://localhost:3000" },
    { CALPACA_DEV_LOGIN: "1", BETTER_AUTH_URL: "https://app.calpaca.io" },
    { CALPACA_DEV_LOGIN: "1", BETTER_AUTH_URL: "http://localhost.evil.example" },
    { CALPACA_DEV_LOGIN: "1" },
  ]) {
    expect(isDevLoginEnabled(env)).toBe(false);
  }
});
