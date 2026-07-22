import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getAvailability, type AvailabilityResponse, type SlotDto } from "@/lib/api";
import { dayKey, formatDay, formatDayTime, formatTime } from "@/lib/time";
import { Button } from "@/components/ui/button";

const WINDOW_DAYS = 14;

/**
 * Slot selection shared by the booking page and the reschedule page: loads
 * availability for (slug, timezone), shows the curated top-3 by default with
 * the full wall as fallback. Bump `reloadKey` to force a refetch (e.g. after
 * a 409 said the wall is stale).
 */
export function SlotPicker({
  slug,
  timezone,
  reloadKey = 0,
  onPick,
  onLoadError,
}: {
  slug: string;
  timezone: string;
  reloadKey?: number;
  onPick: (slot: SlotDto) => void;
  onLoadError: (e: unknown) => void;
}) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = new Date();
    const end = new Date(start.getTime() + WINDOW_DAYS * 86_400_000);
    getAvailability({
      eventTypeSlug: slug,
      start: start.toISOString(),
      end: end.toISOString(),
      inviteeTimezone: timezone,
    })
      .then((r) => {
        if (!cancelled) setAvailability(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) onLoadError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onLoadError is deliberately not a dependency: parents pass fresh
    // closures every render and only (slug, timezone, reloadKey) should refetch
  }, [slug, timezone, reloadKey]);

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

  if (loading) return <p className="text-sm text-muted-foreground">Loading times…</p>;
  if (!availability) return null;
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

      <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll((v) => !v)}>
        {showAll ? "Show suggested times" : "Show all times"}
      </Button>
    </div>
  );
}
