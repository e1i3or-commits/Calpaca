import { useState } from "react";
import { Check } from "lucide-react";
import { ApiError, cancelBooking } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Target of the cancel link in the invite email. Deliberately requires a
 * click — an email scanner prefetching the URL must not cancel a meeting. */
export function CancelPage({ bookingId, token }: { bookingId: string; token: string }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("busy");
    setError(null);
    try {
      await cancelBooking({ bookingId, cancelToken: token, reason: reason || undefined });
      setState("done");
    } catch (e) {
      setState("idle");
      if (e instanceof ApiError && e.status === 403) setError("This cancel link is not valid.");
      else if (e instanceof ApiError && e.status === 404) setError("This booking no longer exists.");
      else if (e instanceof ApiError && e.code === "illegal_transition")
        setError("This booking is already cancelled.");
      else setError("Could not reach the server.");
    }
  }

  if (state === "done") {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" /> Cancelled
            </CardTitle>
            <CardDescription>Everyone on the meeting will be notified.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-24">
      <Card>
        <CardHeader>
          <CardTitle>Cancel this booking?</CardTitle>
          <CardDescription>This can't be undone. You would need to book a new time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button variant="destructive" disabled={state === "busy"} onClick={() => void submit()}>
            {state === "busy" ? "Cancelling…" : "Cancel booking"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
