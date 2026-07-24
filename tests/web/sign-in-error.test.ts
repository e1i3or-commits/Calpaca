import { describe, expect, test } from "bun:test";
import { signInErrorMessage } from "../../web/src/lib/sign-in-error";

describe("sign-in error messaging", () => {
  test("explains how to recover from expired OAuth state", () => {
    expect(signInErrorMessage("state_mismatch")).toContain("Start again");
  });

  test("confirms that cancelling Google sign-in made no changes", () => {
    expect(signInErrorMessage("access_denied")).toContain("No changes were made");
  });

  test("does not expose an unknown provider error code", () => {
    expect(signInErrorMessage("internal_provider_failure"))
      .toBe("Google couldn't complete sign-in. Try again. If it keeps happening, contact support.");
  });
});
