import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock, Globe } from "lucide-react";
import {
  ApiError,
  confirmBooking,
  createHold,
  getAvailability,
  type AvailabilityResponse,
  type BookingConfirmation,
  type SlotDto,
} from "@/lib/api";
import { allTimezones, browserTimezone, dayKey, formatDay, formatDayTime, formatTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WINDOW_DAYS = 14;

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

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERROR_MESSAGES[e.code] ?? `Something went wrong (${e.code}).`;
  return "Could not reach the server.";
}

export function BookingPage({ slug }: { slug: string }) {
  const [timezone, setTimezone] = useState(browserTimezone());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [error, setError] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + WINDOW_DAYS * 86_400_000);
      setAvailability(
        await getAvailability({
          eventTypeSlug: slug,
          start: start.toISOString(),
          end: end.toISOString(),
          inviteeTimezone: timezone,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [slug, timezone]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const byDay = useMemo(() => {
    const groups = new Map<string, SlotDto[]>();
    for (const slot of availability?.all ?? []) {
      const key = dayKey(slot.start.utc, timezone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    for (const slots of groups.values()) {
      slots.sort((a, b) => a.start.utc.localeCompare(b.start.utc));
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [availability, timezone]);

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
            <select
              className="bg-transparent text-sm text-muted-foreground focus:outline-none"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              aria-label="Timezone"
            >
              {allTimezones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {loading && <p className="text-sm text-muted-foreground">Loading times…</p>}

          {!loading && step.name === "pick" && availability && (
            <PickStep
              availability={availability}
              byDay={byDay}
              timezone={timezone}
              showAll={showAll}
              onToggleAll={() => setShowAll((v) => !v)}
              onPick={(slot) => {
                setError(null);
                setStep({ name: "details", slot });
              }}
            />
          )}

          {!loading && step.name === "details" && (
            <DetailsStep
              slot={step.slot}
              slug={slug}
              timezone={timezone}
              onBack={() => setStep({ name: "pick" })}
              onError={(e) => {
                setError(errorMessage(e));
                // a 409 means the slot is gone: reload the wall
                if (e instanceof ApiError && e.status === 409) {
                  setStep({ name: "pick" });
                  void loadAvailability();
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

function PickStep({
  availability,
  byDay,
  timezone,
  showAll,
  onToggleAll,
  onPick,
}: {
  availability: AvailabilityResponse;
  byDay: [string, SlotDto[]][];
  timezone: string;
  showAll: boolean;
  onToggleAll: () => void;
  onPick: (slot: SlotDto) => void;
}) {
  if (availability.all.length === 0) {
    return <p className="text-sm text-muted-foreground">No times available in the next two weeks.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* curated top-3 scored slots are the default; the wall is the fallback */}
      {!showAll && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Suggested times</p>
          {availability.curated.map((slot) => (
            <Button
              key={slot.start.utc}
              variant="outline"
              size="lg"
              className="justify-between"
              onClick={() => onPick(slot)}
            >
              <span>{formatDayTime(slot.start.utc, timezone)}</span>
              {slot.localHourWarning && <AlertTriangle className="h-4 w-4 text-warning" />}
            </Button>
          ))}
        </div>
      )}

      {showAll && (
        <div className="flex flex-col gap-4">
          {byDay.map(([key, slots]) => (
            <div key={key}>
              <p className="mb-2 text-sm font-medium">{formatDay(slots[0]!.start.utc, timezone)}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <Button key={slot.start.utc} variant="outline" size="sm" onClick={() => onPick(slot)}>
                    {formatTime(slot.start.utc, timezone)}
                    {slot.localHourWarning && <AlertTriangle className="h-3 w-3 text-warning" />}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" size="sm" className="self-start" onClick={onToggleAll}>
        {showAll ? "Show suggested times" : "Show all times"}
      </Button>
    </div>
  );
}

function DetailsStep({
  slot,
  slug,
  timezone,
  onBack,
  onError,
  onConfirmed,
}: {
  slot: SlotDto;
  slug: string;
  timezone: string;
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
