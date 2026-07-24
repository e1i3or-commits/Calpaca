import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, X } from "lucide-react";
import { getAvailability, type SlotDto } from "@/lib/api";
import { dayKey, formatDay, formatDayTime, formatTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/month-calendar";

/**
 * Slot selection shared by the booking page and the reschedule page: the
 * curated "best times" up front, a month calendar below it, and tapping a day
 * reveals that day's times. Availability is fetched one month at a time and
 * cached per month; bump `reloadKey` to force a refetch (e.g. after a 409
 * said a slot is stale).
 */

/** Months bookable beyond the current one. Server-side rollingWindowDays
 * empties later months on its own; this just bounds the nav. */
const MAX_MONTHS_AHEAD = 2;

type Cursor = { year: number; month: number };

const pad2 = (n: number) => String(n).padStart(2, "0");
const monthIndex = (c: Cursor) => c.year * 12 + (c.month - 1);
const monthKey = (c: Cursor) => `${c.year}-${pad2(c.month)}`;

function addMonths(c: Cursor, n: number): Cursor {
  const i = monthIndex(c) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** Today's month in the invitee's zone — the calendar's lower nav bound. */
function currentCursor(timezone: string): Cursor {
  const [y, m] = dayKey(new Date().toISOString(), timezone).split("-");
  return { year: Number(y), month: Number(m) };
}

const confidenceLabels = {
  confirmed: "Confirmed",
  needs_confirmation: "Needs confirmation",
  unknown: "Evidence unavailable",
  stale: "Evidence delayed",
} as const;

function evidenceTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function SlotPicker(props: {
  slug: string;
  workspaceSlug?: string;
  timezone: string;
  hosts?: string[];
  optionalHosts?: string[];
  inviteeCalendarToken?: string;
  durationMinutes?: number;
  reloadKey?: number;
  onPick: (slot: SlotDto, missingHostId?: string) => void;
  onLoadError: (e: unknown) => void;
}) {
  // remount on identity change so every piece of state (month cache, curated
  // capture, selected day) resets without effect-ordering choreography
  return (
    <SlotPickerInner
      key={`${props.workspaceSlug ?? ""}|${props.slug}|${props.timezone}|${props.durationMinutes ?? ""}|${props.hosts?.join(",") ?? ""}|${props.optionalHosts?.join(",") ?? ""}|${props.inviteeCalendarToken ?? ""}|${props.reloadKey ?? 0}`}
      {...props}
    />
  );
}

function SlotPickerInner({
  slug,
  workspaceSlug,
  timezone,
  hosts,
  optionalHosts,
  inviteeCalendarToken,
  durationMinutes,
  onPick,
  onLoadError,
}: {
  slug: string;
  workspaceSlug?: string;
  timezone: string;
  hosts?: string[];
  optionalHosts?: string[];
  inviteeCalendarToken?: string;
  durationMinutes?: number;
  onPick: (slot: SlotDto, missingHostId?: string) => void;
  onLoadError: (e: unknown) => void;
}) {
  const [nowCursor] = useState(() => currentCursor(timezone));
  const [cursor, setCursor] = useState(nowCursor);
  const [months, setMonths] = useState<ReadonlyMap<string, readonly SlotDto[]>>(new Map());
  const [curated, setCurated] = useState<readonly SlotDto[] | null>(null);
  const [quorum, setQuorum] = useState<{
    missingHost: { id: string; name: string };
    slots: readonly SlotDto[];
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [explanation, setExplanation] = useState<{
    slot: SlotDto;
    recommendation: NonNullable<SlotDto["recommendation"]>;
  } | null>(null);

  const key = monthKey(cursor);
  const monthSlots = months.get(key);

  useEffect(() => {
    if (months.has(key)) return;
    let cancelled = false;
    // month bounds padded a day each way so no invitee-zone offset can push a
    // slot out of the fetch window; the dayKey filter below re-trims exactly
    const rawStart = new Date(Date.UTC(cursor.year, cursor.month - 1, 1) - 86_400_000);
    const end = new Date(Date.UTC(cursor.year, cursor.month, 1) + 86_400_000);
    const now = new Date();
    const start = rawStart < now ? now : rawStart;
    if (end <= start) {
      setMonths((m) => new Map(m).set(key, []));
      return;
    }
    getAvailability({
      eventTypeSlug: slug,
      workspaceSlug,
      start: start.toISOString(),
      end: end.toISOString(),
      inviteeTimezone: timezone,
      hosts,
      optionalHosts,
      inviteeCalendarToken,
      durationMinutes,
    })
      .then((r) => {
        if (cancelled) return;
        const prefix = `${key}-`;
        const inMonth = r.all.filter((s) => dayKey(s.start.utc, timezone).startsWith(prefix));
        setMonths((m) => new Map(m).set(key, inMonth));
        // curated comes from the first month only: it's the server's top-N
        // for the near window, not something to overwrite while browsing
        setCurated((c) => c ?? r.curated);
        setQuorum((current) => current ?? r.quorum ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFailed(true);
          onLoadError(e);
        }
      });
    return () => {
      cancelled = true;
    };
    // onLoadError is deliberately not a dependency: parents pass fresh
    // closures every render and only the month in view should refetch
  }, [slug, workspaceSlug, timezone, hosts, optionalHosts, inviteeCalendarToken, durationMinutes, key, months]);

  const byDay = useMemo(() => {
    const groups = new Map<string, SlotDto[]>();
    for (const slot of monthSlots ?? []) {
      const day = dayKey(slot.start.utc, timezone);
      groups.set(day, [...(groups.get(day) ?? []), slot]);
    }
    for (const slots of groups.values()) {
      slots.sort((a, b) => a.start.utc.localeCompare(b.start.utc));
    }
    return groups;
  }, [monthSlots, timezone]);

  const availableDays = useMemo(() => new Set(byDay.keys()), [byDay]);
  const firstAvailable = useMemo(() => [...availableDays].sort()[0] ?? null, [availableDays]);
  // derived, not stored: a selection carries across month nav and comes back
  // when its month does, while an empty or foreign month falls back cleanly
  const effectiveDay = selectedDay && availableDays.has(selectedDay) ? selectedDay : firstAvailable;
  const daySlots = effectiveDay ? (byDay.get(effectiveDay) ?? []) : [];

  const loading = monthSlots === undefined;

  useEffect(() => {
    if (!explanation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExplanation(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [explanation]);

  if (failed) return null;
  if (loading && curated === null) {
    return <p className="text-sm text-muted-foreground">Loading times…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {curated !== null && curated.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Best times</p>
          {curated.map((slot) => (
            <div key={slot.start.utc} className="overflow-hidden rounded-lg border border-border bg-card">
              <button
                type="button"
                className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => onPick(slot)}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {formatDay(slot.start.utc, timezone)}
                  </span>
                  <span className="mt-0.5 block text-lg font-semibold leading-tight">
                    {formatTime(slot.start.utc, timezone)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {slot.recommendation && (
                    <span className="hidden sm:inline">{confidenceLabels[slot.recommendation.confidence]}</span>
                  )}
                  {slot.seatsRemaining !== undefined && (
                    <span>{slot.seatsRemaining} seat{slot.seatsRemaining === 1 ? "" : "s"} left</span>
                  )}
                  {slot.mutual && <CalendarCheck aria-label="Works with your calendar" className="h-4 w-4 text-primary" />}
                  {slot.localHourWarning && <AlertTriangle aria-label="Outside typical local hours" className="h-4 w-4 text-warning" />}
                  <span className="rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground">
                    <span className="sm:hidden">Choose</span>
                    <span className="hidden sm:inline">Choose time</span>
                  </span>
                </span>
              </button>
              {slot.recommendation && (
                <button
                  type="button"
                  className="min-h-11 w-full border-t border-border px-4 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => setExplanation({ slot, recommendation: slot.recommendation! })}
                >
                  Why this time?
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {explanation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-explanation-title"
          className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExplanation(null);
          }}
        >
          <div className="max-h-[85vh] w-full overflow-y-auto bg-background p-5 shadow-xl sm:max-w-lg sm:rounded-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {formatDay(explanation.slot.start.utc, timezone)}
                </p>
                <h2 id="slot-explanation-title" className="mt-1 text-2xl font-semibold">
                  {formatTime(explanation.slot.start.utc, timezone)}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close explanation"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setExplanation(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Why Calpaca suggested it
            </p>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {explanation.recommendation.reasons.map((reason) => (
                <li key={`${reason.label}-${reason.detail}`} className="py-4">
                  <p className="text-sm font-medium">{reason.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{reason.detail}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{confidenceLabels[explanation.recommendation.confidence]}</span>
              {explanation.recommendation.evidenceCheckedAt && (
                <span>
                  Checked {evidenceTime(explanation.recommendation.evidenceCheckedAt, timezone)}
                </span>
              )}
            </div>
            <button
              type="button"
              className="mt-6 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              onClick={() => onPick(explanation.slot)}
            >
              Choose this time
            </button>
          </div>
        </div>
      )}

      {curated !== null && curated.length === 0 && quorum && quorum.slots.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">No time works for everyone.</p>
          <p className="text-sm text-muted-foreground">
            Best times without {quorum.missingHost.name}:
          </p>
          {quorum.slots.slice(0, 3).map((slot) => (
            <Button
              key={slot.start.utc}
              variant="outline"
              className="justify-between bg-card"
              onClick={() => onPick(slot, quorum.missingHost.id)}
            >
              <span>{formatDayTime(slot.start.utc, timezone)}</span>
              {slot.localHourWarning && <AlertTriangle className="h-4 w-4 text-warning" />}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <MonthCalendar
          year={cursor.year}
          month={cursor.month}
          availableDays={availableDays}
          selectedDay={effectiveDay}
          onSelectDay={setSelectedDay}
          onPrev={() => setCursor((c) => addMonths(c, -1))}
          onNext={() => setCursor((c) => addMonths(c, 1))}
          canPrev={monthIndex(cursor) > monthIndex(nowCursor)}
          canNext={monthIndex(cursor) < monthIndex(nowCursor) + MAX_MONTHS_AHEAD}
        />

        <div className="flex flex-col gap-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading times…</p>
          ) : effectiveDay ? (
            <>
              <p className="text-sm font-medium">{formatDay(daySlots[0]!.start.utc, timezone)}</p>
              <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-2">
                {daySlots.map((slot) => (
                  <Button key={slot.start.utc} variant="outline" size="sm" onClick={() => onPick(slot)}>
                    {formatTime(slot.start.utc, timezone)}
                    {slot.seatsRemaining !== undefined && (
                      <span className="text-[10px] text-muted-foreground">
                        {slot.seatsRemaining} left
                      </span>
                    )}
                    {slot.mutual && <CalendarCheck aria-label="Works with your calendar" className="h-3 w-3 text-primary" />}
                    {slot.localHourWarning && <AlertTriangle className="h-3 w-3 text-warning" />}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No times available this month.</p>
          )}
        </div>
      </div>
    </div>
  );
}
