import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock, Globe } from "lucide-react";
import {
  ApiError,
  getRescheduleContext,
  rescheduleBooking,
  type RenderedInstant,
  type RescheduleContext,
  type SlotDto,
} from "@/lib/api";
import { browserTimezone, formatDayTime, formatTime } from "@/lib/time";
import { SlotPicker } from "@/components/slot-picker";
import { errorMessage, TimezoneSelect } from "@/pages/booking-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Step =
  | { name: "pick" }
  | { name: "confirm"; slot: SlotDto }
  | { name: "done"; start: RenderedInstant; end: RenderedInstant };

/** Target of the reschedule link in the invite email. The token authorizes
 * both reading the booking context and the reschedule itself. */
export function ReschedulePage({ bookingId, token }: { bookingId: string; token: string }) {
  const [ctx, setCtx] = useState<RescheduleContext | null>(null);
  const [timezone, setTimezone] = useState(browserTimezone());
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getRescheduleContext(bookingId, token)
      .then(setCtx)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 403) setError("This reschedule link is not valid.");
        else if (e instanceof ApiError && e.status === 404) setError("This booking no longer exists.");
        else setError(errorMessage(e));
      });
  }, [bookingId, token]);

  async function submit(slot: SlotDto) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await rescheduleBooking({
        bookingId,
        rescheduleToken: token,
        start: slot.start.utc,
        end: slot.end.utc,
      });
      setStep({ name: "done", start: result.start, end: result.end });
    } catch (e) {
      setError(errorMessage(e));
      // slot vanished between pick and confirm: back to a fresh wall
      if (e instanceof ApiError && e.status === 409) {
        setStep({ name: "pick" });
        setReloadKey((k) => k + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            {step.name === "done" && <Check className="h-5 w-5 text-primary" />}
            {step.name === "done" ? "Rescheduled" : "Reschedule"}
          </CardTitle>
          {ctx && step.name !== "done" && (
            <CardDescription className="flex flex-col gap-1.5">
              <span>
                Currently: {formatDayTime(ctx.start.utc, timezone)} – {formatTime(ctx.end.utc, timezone)}
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                <TimezoneSelect value={timezone} onChange={setTimezone} />
              </span>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          {!error && !ctx && <p className="text-sm text-muted-foreground">Loading…</p>}

          {ctx && step.name === "pick" && (
            <SlotPicker
              slug={ctx.eventTypeSlug}
              timezone={timezone}
              reloadKey={reloadKey}
              onLoadError={(e) => setError(errorMessage(e))}
              onPick={(slot) => {
                setError(null);
                setStep({ name: "confirm", slot });
              }}
            />
          )}

          {ctx && step.name === "confirm" && (
            <div className="flex flex-col gap-4">
              <button
                className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setStep({ name: "pick" })}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <Clock className="h-4 w-4 shrink-0" />
                {formatDayTime(step.slot.start.utc, timezone)} – {formatTime(step.slot.end.utc, timezone)}
              </div>
              <Button disabled={submitting} onClick={() => void submit(step.slot)}>
                {submitting ? "Rescheduling…" : "Confirm new time"}
              </Button>
            </div>
          )}

          {step.name === "done" && (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                {formatDayTime(step.start.utc, timezone)} – {formatTime(step.end.utc, timezone)} ({timezone})
              </p>
              <p className="text-muted-foreground">An updated calendar invite is on its way.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
