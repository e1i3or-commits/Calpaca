import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReleaseUpdate } from "@/lib/use-release-update";

export function UpdateNotice() {
  const available = useReleaseUpdate();
  // Embedded booking widgets are refreshed by their host page, not the invitee.
  if (!available || window.parent !== window) return null;
  // Booking pages theme <html>; every other page is an organizer surface.
  const organizerSurface = !document.documentElement.dataset["theme"];

  return (
    <div
      data-organizer={organizerSurface || undefined}
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[100] flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm"
    >
      <RefreshCw aria-hidden className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">An update is available</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Save your work, then refresh when you’re ready.</p>
      </div>
      <Button size="sm" className="shrink-0" onClick={() => window.location.reload()}>
        Refresh
      </Button>
    </div>
  );
}
