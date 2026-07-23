import { describe, expect, test } from "bun:test";
import {
  bookingLayoutNames,
  canUseTheme,
  publicThemeNames,
  resolveBookingLayout,
  themeNames,
} from "../../../src/core/theming/themes";

describe("booking presentation registry", () => {
  test("adds four public themes and keeps TourScale private", () => {
    expect(publicThemeNames).toEqual([
      "default", "midnight", "sand", "juniper", "solstice", "cobalt", "paper",
    ]);
    expect(themeNames).toContain("tourscale");
    expect(publicThemeNames).not.toContain("tourscale");
  });

  test("TourScale is available only to the TourScale account domain", () => {
    expect(canUseTheme("tourscale", "kai@tourscale.com")).toBe(true);
    expect(canUseTheme("tourscale", "KAI@TOURSCALE.COM")).toBe(true);
    expect(canUseTheme("tourscale", "kai@example.com")).toBe(false);
    expect(canUseTheme("juniper", "kai@example.com")).toBe(true);
  });

  test("offers three layouts and safely falls back to focus", () => {
    expect(bookingLayoutNames).toEqual(["focus", "split", "compact"]);
    expect(resolveBookingLayout("split")).toBe("split");
    expect(resolveBookingLayout("unknown")).toBe("focus");
    expect(resolveBookingLayout(undefined)).toBe("focus");
  });
});
