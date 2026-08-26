/**
 * Private theme packs. A deployment can carry themes that are not part of the
 * bundled registry — a white-labelled instance wants its own tokens without
 * those tokens living in this repository. The pack is supplied as JSON by the
 * operator (see docs/SELF-HOSTING.md), parsed here, and emitted as the same
 * [data-theme] token blocks web/src/themes.css writes by hand.
 *
 * Everything in this module is pure: the caller reads the environment and
 * passes the raw string in.
 */

import { err, ok, type Result } from "../../lib/result";
import { publicThemeNames } from "./themes";

export interface PrivateTheme {
  readonly name: string;
  readonly label: string;
  readonly tokens: Readonly<Record<string, string>>;
}

/** Only tokens that themes.css actually defines — a pack cannot introduce new
 * custom properties, so it cannot reach anything a bundled theme cannot. */
export const privateThemeTokenNames = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--primary",
  "--primary-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--ring",
  "--warning",
  "--warning-foreground",
  "--destructive",
  "--destructive-foreground",
  "--radius",
  "--theme-font-body",
] as const;

const MAX_THEMES = 8;
const MAX_VALUE_LENGTH = 120;
const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;
// Colors, lengths and font stacks only. Excluding ; { } @ \ and url( keeps a
// value from closing its declaration block or fetching anything.
const VALUE_RE = /^[a-zA-Z0-9 .,%()\-#'"/]+$/;

function parseTheme(raw: unknown, index: number): Result<PrivateTheme, string> {
  const at = `theme ${index}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return err(`${at}: expected an object`);
  }
  const { name, label, tokens } = raw as Record<string, unknown>;

  if (typeof name !== "string" || !NAME_RE.test(name)) {
    return err(`${at}: name must be kebab-case, 2-31 characters`);
  }
  if ((publicThemeNames as readonly string[]).includes(name)) {
    return err(`${at}: "${name}" is a bundled theme name`);
  }
  if (typeof label !== "string" || label.trim() === "" || label.length > 40) {
    return err(`${at}: label must be 1-40 characters`);
  }
  if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
    return err(`${at}: tokens must be an object`);
  }

  const entries = Object.entries(tokens as Record<string, unknown>);
  if (entries.length === 0) return err(`${at}: tokens must not be empty`);

  for (const [token, value] of entries) {
    if (!(privateThemeTokenNames as readonly string[]).includes(token)) {
      return err(`${at}: unknown token "${token}"`);
    }
    if (typeof value !== "string" || value.trim() === "" || value.length > MAX_VALUE_LENGTH) {
      return err(`${at}: ${token} must be a string of 1-${MAX_VALUE_LENGTH} characters`);
    }
    if (!VALUE_RE.test(value) || value.toLowerCase().includes("url(")) {
      return err(`${at}: ${token} contains characters that are not allowed in a token value`);
    }
  }

  return ok({
    name,
    label: label.trim(),
    tokens: Object.fromEntries(entries as Array<[string, string]>),
  });
}

/** Parses a pack. An absent or blank value is not an error — it means the
 * deployment has no private themes, which is the normal case. */
export function parsePrivateThemes(
  raw: string | undefined | null,
): Result<readonly PrivateTheme[], string> {
  if (raw === undefined || raw === null || raw.trim() === "") return ok([]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err("not valid JSON");
  }
  if (!Array.isArray(parsed)) return err("expected an array of themes");
  if (parsed.length > MAX_THEMES) return err(`at most ${MAX_THEMES} themes`);

  const themes: PrivateTheme[] = [];
  for (const [index, entry] of parsed.entries()) {
    const theme = parseTheme(entry, index);
    if (!theme.ok) return theme;
    if (themes.some((existing) => existing.name === theme.value.name)) {
      return err(`duplicate theme name "${theme.value.name}"`);
    }
    themes.push(theme.value);
  }
  return ok(themes);
}

/** The stylesheet a browser loads alongside the bundled themes.css. */
export function privateThemeCss(themes: readonly PrivateTheme[]): string {
  return themes
    .map((theme) => {
      const declarations = Object.entries(theme.tokens)
        .map(([token, value]) => `  ${token}: ${value};`)
        .join("\n");
      return `[data-theme="${theme.name}"] {\n${declarations}\n}`;
    })
    .join("\n\n");
}
