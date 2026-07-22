import { describe, expect, test } from "bun:test";
import {
  defaultTheme,
  isThemeName,
  resolveTheme,
  themeLabels,
  themeNames,
} from "../../../src/core/theming/themes";

describe("theme registry", () => {
  test("names are unique and include the default", () => {
    expect(new Set(themeNames).size).toBe(themeNames.length);
    expect(themeNames).toContain(defaultTheme);
  });

  test("every theme has a label", () => {
    for (const name of themeNames) {
      expect(themeLabels[name].length).toBeGreaterThan(0);
    }
  });

  test("isThemeName accepts registry names and rejects everything else", () => {
    for (const name of themeNames) expect(isThemeName(name)).toBe(true);
    expect(isThemeName("neon")).toBe(false);
    expect(isThemeName("")).toBe(false);
    expect(isThemeName("Default")).toBe(false);
  });

  test("resolveTheme falls back to the default for unknown or missing values", () => {
    expect(resolveTheme("midnight")).toBe("midnight");
    expect(resolveTheme("neon")).toBe(defaultTheme);
    expect(resolveTheme(null)).toBe(defaultTheme);
    expect(resolveTheme(undefined)).toBe(defaultTheme);
  });
});
