import { useEffect, useState } from "react";
import { hasNewRelease, RELEASE_CHECK_INTERVAL_MS, RELEASE_MANIFEST_PATH } from "@/lib/release-version";

/**
 * Polls the deployed build manifest while the tab is visible. Never reloads on
 * its own: an organizer or invitee may be mid-form.
 */
export function useReleaseUpdate(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || available) return;
    let stopped = false;
    let busy = false;

    const check = async () => {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const response = await fetch(RELEASE_MANIFEST_PATH, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok && !stopped) {
          setAvailable(hasNewRelease(__CALPACA_BUILD_ID__, await response.json()));
        }
      } catch {
        // Offline or mid-deploy: try again on the next tick or focus.
      } finally {
        busy = false;
      }
    };

    const onVisible = () => void check();
    const timer = window.setInterval(onVisible, RELEASE_CHECK_INTERVAL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    void check();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [available]);

  return available;
}
