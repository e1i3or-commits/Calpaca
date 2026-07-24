import { describe, expect, test } from "bun:test";
import {
  bookingLayoutNames,
  publicThemeNames,
  resolveBookingLayout,
  themeNames,
} from "../../../src/core/theming/themes";

describe("booking presentation registry", () => {
  test("exposes the complete public theme registry", () => {
    expect(publicThemeNames).toEqual([
      "default", "midnight", "sand", "juniper", "solstice", "cobalt", "paper",
    ]);
    expect(themeNames).toEqual(publicThemeNames);
    expect(themeNames).toHaveLength(7);
    expect(new Set(themeNames).size).toBe(themeNames.length);
  });

  test("offers three layouts and safely falls back to focus", () => {
    expect(bookingLayoutNames).toEqual(["focus", "split", "compact"]);
    expect(resolveBookingLayout("split")).toBe("split");
    expect(resolveBookingLayout("unknown")).toBe("focus");
    expect(resolveBookingLayout(undefined)).toBe("focus");
  });
});
