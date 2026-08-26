import { useEffect } from "react";

// Mirrors src/core/theming/themes.ts (same deliberate duplication as the
// routing types in api.ts — the web bundle never imports server code).
export const themeOptions = [
  { value: "default", label: "Default" },
  { value: "calpaca", label: "Calpaca" },
  { value: "midnight", label: "Midnight" },
  { value: "sand", label: "Sand" },
  { value: "juniper", label: "Juniper" },
  { value: "solstice", label: "Solstice" },
  { value: "cobalt", label: "Cobalt" },
  { value: "paper", label: "Paper" },
] as const;
// A deployment may serve private themes (/themes/private.css) whose names this
// bundle cannot know, so the shape of the name is what is checked here. A name
// with no matching token block simply inherits the default tokens.
const THEME_NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;

/** Applies a theme by setting [data-theme] on <html>; the token blocks in
 * themes.css — or the deployment's private stylesheet — do the rest. */
export function applyTheme(theme: string | undefined): void {
  if (theme && theme !== "default" && THEME_NAME_RE.test(theme)) {
    document.documentElement.dataset["theme"] = theme;
  } else {
    delete document.documentElement.dataset["theme"];
  }
}

export type BookingLayout = "focus" | "split" | "compact";

export function useBookingLayout(layout: string | undefined): BookingLayout {
  const resolved: BookingLayout =
    layout === "split" || layout === "compact" ? layout : "focus";
  useEffect(() => {
    document.documentElement.dataset["bookingLayout"] = resolved;
    return () => {
      delete document.documentElement.dataset["bookingLayout"];
    };
  }, [resolved]);
  return resolved;
}

/** Theme follows the page: applied while mounted, reset on unmount so an
 * SPA navigation back to the dashboard doesn't keep a booking-page theme. */
export function useTheme(theme: string | undefined): void {
  useEffect(() => {
    applyTheme(theme);
    return () => applyTheme(undefined);
  }, [theme]);
}
