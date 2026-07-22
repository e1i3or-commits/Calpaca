import { useEffect } from "react";

// Mirrors src/core/theming/themes.ts (same deliberate duplication as the
// routing types in api.ts — the web bundle never imports server code).
export const themeOptions = [
  { value: "default", label: "Default" },
  { value: "midnight", label: "Midnight" },
  { value: "sand", label: "Sand" },
] as const;

/** Applies a bundled theme by setting [data-theme] on <html>; the token
 * blocks in themes.css do the rest. Unknown names fall back to default. */
export function applyTheme(theme: string | undefined): void {
  const known = theme && themeOptions.some((t) => t.value === theme);
  if (known && theme !== "default") {
    document.documentElement.dataset["theme"] = theme;
  } else {
    delete document.documentElement.dataset["theme"];
  }
}

/** Theme follows the page: applied while mounted, reset on unmount so an
 * SPA navigation back to the dashboard doesn't keep a booking-page theme. */
export function useTheme(theme: string | undefined): void {
  useEffect(() => {
    applyTheme(theme);
    return () => applyTheme(undefined);
  }, [theme]);
}
