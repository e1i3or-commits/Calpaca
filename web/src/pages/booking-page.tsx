import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock, Globe } from "lucide-react";
import {
  ApiError,
  confirmBooking,
  createHold,
  type BookingConfirmation,
  type RoutingAnswers,
  type SlotDto,
} from "@/lib/api";
import { allTimezones, browserTimezone, formatDayTime, formatTime } from "@/lib/time";
import { SlotPicker } from "@/components/slot-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step =
  | { name: "pick" }
  | { name: "details"; slot: SlotDto }
  | { name: "confirmed"; slot: SlotDto; confirmation: BookingConfirmation };

const ERROR_MESSAGES: Record<string, string> = {
  event_type_not_found: "This booking link doesn't exist.",
  slot_not_available: "That time was just taken. Pick another one.",
  slot_taken: "That time was just taken. Pick another one.",
  expired: "The hold on that time expired. Pick it again.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERROR_MESSAGES[e.code] ?? `Something went wrong (${e.code}).`;
  return "Could not reach the server.";
}

export function BookingPage({
  slug,
  routingAnswers,
}: {
  slug: string;
  /** present when the invitee arrived via a routing form (/r/<form>) */
  routingAnswers?: RoutingAnswers;
}) {
  const [timezone, setTimezone] = useState(browserTimezone());
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (step.name === "confirmed") {
    return <Confirmation slot={step.slot} confirmation={step.confirmation} timezone={timezone} />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{slug.replace(/-/g, " ")}</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            <TimezoneSelect value={timezone} onChange={setTimezone} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          {step.name === "pick" && (
            <SlotPicker
              slug={slug}
              timezone={timezone}
              reloadKey={reloadKey}
              onLoadError={(e) => setError(errorMessage(e))}
              onPick={(slot) => {
                setError(null);
                setStep({ name: "details", slot });
              }}
            />
          )}

          {step.name === "details" && (
            <DetailsStep
              slot={step.slot}
              slug={slug}
              timezone={timezone}
              routingAnswers={routingAnswers}
              onBack={() => setStep({ name: "pick" })}
              onError={(e) => {
                setError(errorMessage(e));
                // a 409 means the slot is gone: reload the wall
                if (e instanceof ApiError && e.status === 409) {
                  setStep({ name: "pick" });
                  setReloadKey((k) => k + 1);
                }
              }}
              onConfirmed={(confirmation) => setStep({ name: "confirmed", slot: step.slot, confirmation })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  return (
    <select
      className="bg-transparent text-sm text-muted-foreground focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Timezone"
    >
      {allTimezones().map((tz) => (
        <option key={tz} value={tz}>
          {tz}
        </option>
      ))}
    </select>
  );
}

function DetailsStep({
  slot,
  slug,
  timezone,
  routingAnswers,
  onBack,
  onError,
  onConfirmed,
}: {
  slot: SlotDto;
  slug: string;
  timezone: string;
  routingAnswers?: RoutingAnswers;
  onBack: () => void;
  onError: (e: unknown) => void;
  onConfirmed: (confirmation: BookingConfirmation) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      // hold-then-confirm: the server re-verifies availability inside the
      // hold transaction, the client never wins a race by itself
      const hold = await createHold({ eventTypeSlug: slug, start: slot.start.utc, end: slot.end.utc });
      const confirmation = await confirmBooking({
        eventTypeSlug: slug,
        holdIds: hold.holdIds,
        invitee: { email, name, timezone },
        routingAnswers,
      });
      onConfirmed(confirmation);
    } catch (e) {
      onError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
        <Clock className="h-4 w-4 shrink-0" />
        {formatDayTime(slot.start.utc, timezone)} – {formatTime(slot.end.utc, timezone)}
      </div>

      {slot.localHourWarning && (
        <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This is outside typical waking hours in {timezone}. Double-check it works for you.
        </div>
      )}

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" disabled={submitting || !name || !email}>
          {submitting ? "Booking…" : "Confirm booking"}
        </Button>
      </form>
    </div>
  );
}

function Confirmation({
  slot,
  confirmation,
  timezone,
}: {
  slot: SlotDto;
  confirmation: BookingConfirmation;
  timezone: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Check className="h-5 w-5 text-primary" /> Booked
          </CardTitle>
          <CardDescription>
            {formatDayTime(slot.start.utc, timezone)} – {formatTime(slot.end.utc, timezone)} ({timezone})
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {confirmation.emailSuggestion && (
            <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 px-3 py-2 text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Did you mean {confirmation.emailSuggestion}? Your confirmation email may not arrive otherwise.
            </div>
          )}
          <p className="text-muted-foreground">
            A calendar invite is on its way. Use the links in the email to reschedule or cancel.
          </p>
          <p className="text-xs text-muted-foreground">Booking reference: {confirmation.bookingId}</p>
        </CardContent>
      </Card>
    </div>
  );
}
