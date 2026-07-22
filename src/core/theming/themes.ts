/**
 * The bundled theme registry. Token values live in web/src/themes.css as
 * CSS-variable blocks keyed by [data-theme]; this module is the single list
 * of valid names so the API can validate what the dashboard saves and the
 * booking page can trust what it applies. Adding a theme means one entry
 * here plus one block in themes.css — nothing else.
 */

export const themeNames = ["default", "midnight", "sand"] as const;

export type ThemeName = (typeof themeNames)[number];

export const defaultTheme: ThemeName = "default";

/** Dashboard-facing labels, in display order. */
export const themeLabels: Readonly<Record<ThemeName, string>> = {
  default: "Default",
  midnight: "Midnight",
  sand: "Sand",
};

export function isThemeName(value: string): value is ThemeName {
  return (themeNames as readonly string[]).includes(value);
}

/** Anything not in the registry renders as the default theme — a stale or
 * hand-edited value must never leave a public page unstyled. */
export function resolveTheme(value: string | null | undefined): ThemeName {
  return value && isThemeName(value) ? value : defaultTheme;
}
