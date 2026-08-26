import { describe, expect, test } from "bun:test";

import {
  parsePrivateThemes,
  privateThemeCss,
  type PrivateTheme,
} from "../../../src/core/theming/private-themes";

const pack = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify([
    {
      name: "acme",
      label: "Acme",
      tokens: { "--primary": "oklch(0.36 0.11 265)", "--radius": "0.75rem" },
      ...overrides,
    },
  ]);

describe("parsePrivateThemes", () => {
  test("an absent pack is not an error", () => {
    for (const raw of [undefined, null, "", "   "]) {
      const result = parsePrivateThemes(raw);
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toEqual([]);
    }
  });

  test("parses a valid pack", () => {
    const result = parsePrivateThemes(pack());
    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]).toEqual({
      name: "acme",
      label: "Acme",
      tokens: { "--primary": "oklch(0.36 0.11 265)", "--radius": "0.75rem" },
    });
  });

  test("rejects malformed JSON and non-arrays", () => {
    expect(parsePrivateThemes("{").ok).toBe(false);
    expect(parsePrivateThemes('{"name":"acme"}').ok).toBe(false);
  });

  test("rejects names that collide with the bundled registry", () => {
    const result = parsePrivateThemes(pack({ name: "midnight" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("bundled theme name");
  });

  test("rejects duplicate names within a pack", () => {
    const raw = JSON.stringify([
      { name: "acme", label: "One", tokens: { "--radius": "1rem" } },
      { name: "acme", label: "Two", tokens: { "--radius": "2rem" } },
    ]);
    const result = parsePrivateThemes(raw);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("duplicate");
  });

  test("rejects tokens outside the themes.css set", () => {
    const result = parsePrivateThemes(pack({ tokens: { "--sneaky": "red" } }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("unknown token");
  });

  // A token value is interpolated straight into a stylesheet, so anything that
  // could close the block or start a request has to be refused here.
  test("rejects values that could escape the declaration block", () => {
    const escapes = [
      "red; } body { display: none",
      "url(https://example.com/x.png)",
      "URL(data:image/svg+xml,x)",
      "@import 'x'",
      "red } *{color:red}",
    ];
    for (const value of escapes) {
      const result = parsePrivateThemes(pack({ tokens: { "--primary": value } }));
      expect(result.ok).toBe(false);
    }
  });

  test("rejects an empty token map and over-long values", () => {
    expect(parsePrivateThemes(pack({ tokens: {} })).ok).toBe(false);
    expect(parsePrivateThemes(pack({ tokens: { "--primary": "a".repeat(121) } })).ok).toBe(false);
  });

  test("rejects bad names and labels", () => {
    for (const name of ["A", "1acme", "a", "acme_co", "acme!", "a".repeat(32)]) {
      expect(parsePrivateThemes(pack({ name })).ok).toBe(false);
    }
    expect(parsePrivateThemes(pack({ label: "" })).ok).toBe(false);
    expect(parsePrivateThemes(pack({ label: "x".repeat(41) })).ok).toBe(false);
  });

  test("caps the number of themes", () => {
    const many = JSON.stringify(
      Array.from({ length: 9 }, (_, index) => ({
        name: `theme-${index}`,
        label: `Theme ${index}`,
        tokens: { "--radius": "1rem" },
      })),
    );
    expect(parsePrivateThemes(many).ok).toBe(false);
  });
});

describe("privateThemeCss", () => {
  test("emits one [data-theme] block per theme", () => {
    const themes: PrivateTheme[] = [
      { name: "acme", label: "Acme", tokens: { "--primary": "oklch(0.36 0.11 265)" } },
      { name: "zenith", label: "Zenith", tokens: { "--radius": "0.25rem" } },
    ];
    expect(privateThemeCss(themes)).toBe(
      ':root[data-theme="acme"] {\n  --primary: oklch(0.36 0.11 265);\n}\n\n'
        + ':root[data-theme="zenith"] {\n  --radius: 0.25rem;\n}',
    );
  });

  // The stylesheet is a separate <link>; a bare [data-theme] block ties with
  // the bundle's :root defaults and loses whenever the bundle loads later.
  test("outranks the bundle's :root defaults on specificity, not order", () => {
    const css = privateThemeCss([
      { name: "acme", label: "Acme", tokens: { "--primary": "red" } },
    ]);
    expect(css.startsWith(':root[data-theme="acme"]')).toBe(true);
  });

  test("no themes means no stylesheet", () => {
    expect(privateThemeCss([])).toBe("");
  });
});
