/**
 * Deployment-configured private themes. The pack is read from the environment
 * once per process; a malformed pack is logged and treated as absent so a bad
 * value degrades to the bundled themes instead of failing every request.
 */

import { z } from "zod";

import { isThemeName } from "../core/theming/themes";
import {
  parsePrivateThemes,
  privateThemeCss,
  type PrivateTheme,
} from "../core/theming/private-themes";

let cached: readonly PrivateTheme[] | undefined;

export function privateThemes(): readonly PrivateTheme[] {
  if (cached === undefined) {
    const parsed = parsePrivateThemes(process.env.CALPACA_PRIVATE_THEMES);
    if (!parsed.ok) {
      console.error(`CALPACA_PRIVATE_THEMES ignored: ${parsed.error}`);
      cached = [];
    } else {
      cached = parsed.value;
    }
  }
  return cached;
}

export function privateThemeNames(): readonly string[] {
  return privateThemes().map((theme) => theme.name);
}

export function privateThemeOptions(): ReadonlyArray<{ value: string; label: string }> {
  return privateThemes().map((theme) => ({ value: theme.name, label: theme.label }));
}

export function privateThemeStylesheet(): string {
  return privateThemeCss(privateThemes());
}

/** Tests mutate the environment; production never calls this. */
export function resetPrivateThemeCache(): void {
  cached = undefined;
}

/** Theme names accepted on write: the bundled registry plus this
 * deployment's private pack. */
export const themeNameSchema = z
  .string()
  .max(31)
  .refine((value) => isThemeName(value) || privateThemeNames().includes(value), {
    message: "unknown theme",
  });
