import { expect, test } from "bun:test";
import { hasNewRelease } from "../../web/src/lib/release-version";

const current = "11111111-1111-4111-8111-111111111111";

test("prompts only for a valid, different build, including a rollback", () => {
  expect(hasNewRelease(current, { buildId: "22222222-2222-4222-8222-222222222222" })).toBe(true);
  for (const manifest of [null, {}, "<html>Error</html>", { buildId: current }, { buildId: "unavailable" }, 42]) {
    expect(hasNewRelease(current, manifest)).toBe(false);
  }
});
