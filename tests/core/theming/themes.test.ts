import { readFileSync } from "node:fs";
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

  // The registry is only half of a theme; the tokens live in CSS. A name with
  // no block passes validation and then renders a public page with whatever
  // tokens the previous theme left behind, so parity is worth asserting.
  describe("token parity with themes.css", () => {
    const css = readFileSync(
      new URL("../../../web/src/themes.css", import.meta.url),
      "utf8",
    );
    // `default` is the :root block rather than a [data-theme] selector.
    const declared = new Set([
      ...css.matchAll(/\[data-theme="([^"]+)"\]/g),
    ].map((match) => match[1]!));
    declared.add(defaultTheme);

    const required = [
      "--background", "--foreground", "--primary", "--primary-foreground",
      "--muted", "--muted-foreground", "--border", "--ring", "--radius",
    ];

    test("every registry name has a block", () => {
      for (const name of themeNames) expect(declared).toContain(name);
    });

    test("no block exists for a name outside the registry", () => {
      for (const name of declared) expect(isThemeName(name)).toBe(true);
    });

    // The web bundle keeps its own copy of the registry because it never
    // imports server code, and applyTheme() treats an unlisted name as
    // "default" *silently*. A theme missing from that copy therefore renders
    // a public page in the wrong palette with no error anywhere — observed,
    // not hypothetical.
    test("the web bundle's mirror lists the same themes in the same order", () => {
      const mirror = readFileSync(
        new URL("../../../web/src/lib/theme.ts", import.meta.url),
        "utf8",
      );
      const options = [
        ...mirror.matchAll(/\{\s*value:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g),
      ];
      expect(options.map((option) => option[1])).toEqual([...themeNames]);
      for (const [, value, label] of options) {
        expect(label).toBe(themeLabels[value as keyof typeof themeLabels]);
      }
    });

    test("every theme defines the load-bearing tokens", () => {
      for (const name of themeNames) {
        const selector = name === defaultTheme ? ":root" : `[data-theme="${name}"]`;
        const block = css.slice(css.indexOf(selector));
        const body = block.slice(0, block.indexOf("}"));
        for (const token of required) {
          expect(body, `${name} is missing ${token}`).toContain(`${token}:`);
        }
      }
    });
  });
});
