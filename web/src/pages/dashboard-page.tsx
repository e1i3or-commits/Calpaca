import { useEffect, useState } from "react";
import { Calendar, CheckCircle2 } from "lucide-react";
import { ApiError, getMyCalendars, signOut, type CalendarEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Minimal host view: proves the auth + calendar chain end to end. The full
// dashboard (event types, schedules, teams) is a later milestone.
export function DashboardPage() {
  const [calendars, setCalendars] = useState<CalendarEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyCalendars()
      .then((r) => setCalendars(r.calendars))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/sign-in";
          return;
        }
        setError(e instanceof ApiError ? `Error: ${e.code}` : "Could not reach the server.");
      });
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl">Your calendars</CardTitle>
            <CardDescription>Busy times sync from connected calendars.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void signOut().then(() => (window.location.href = "/sign-in"));
            }}
          >
            Sign out
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !calendars && <p className="text-sm text-muted-foreground">Loading…</p>}
          {calendars && (
            <ul className="flex flex-col gap-2">
              {calendars.map((cal) => (
                <li key={cal.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    {cal.summary}
                    {cal.primary && <span className="ml-2 text-xs text-muted-foreground">primary</span>}
                  </span>
                  {cal.connected && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> syncing
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
