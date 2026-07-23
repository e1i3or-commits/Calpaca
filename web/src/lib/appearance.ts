import { useEffect, useState } from "react";
import {
  resolveAppearance,
  type Appearance,
} from "../../../src/core/theming/appearance";

const STORAGE_KEY = "calpaca:appearance";

export function initializeAppearance(): Appearance {
  const appearance = resolveAppearance(
    localStorage.getItem(STORAGE_KEY),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  document.documentElement.dataset["appearance"] = appearance;
  return appearance;
}

export function useAppearance(): {
  appearance: Appearance;
  toggleAppearance: () => void;
} {
  const [appearance, setAppearance] = useState<Appearance>(() => initializeAppearance());

  useEffect(() => {
    document.documentElement.dataset["appearance"] = appearance;
    localStorage.setItem(STORAGE_KEY, appearance);
  }, [appearance]);

  return {
    appearance,
    toggleAppearance: () => setAppearance((current) => current === "dark" ? "light" : "dark"),
  };
}
