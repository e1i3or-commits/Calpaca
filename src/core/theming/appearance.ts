export type Appearance = "light" | "dark";

export function resolveAppearance(
  stored: string | null,
  prefersDark: boolean,
): Appearance {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}
