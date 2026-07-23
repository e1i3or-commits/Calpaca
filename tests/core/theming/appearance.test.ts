import { describe, expect, test } from "bun:test";
import { resolveAppearance } from "../../../src/core/theming/appearance";

describe("organizer appearance", () => {
  test("uses an explicit saved preference", () => {
    expect(resolveAppearance("dark", false)).toBe("dark");
    expect(resolveAppearance("light", true)).toBe("light");
  });

  test("follows the operating system before a preference is saved", () => {
    expect(resolveAppearance(null, true)).toBe("dark");
    expect(resolveAppearance(null, false)).toBe("light");
  });
});
