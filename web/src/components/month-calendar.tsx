import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Purely presentational month grid: which days light up, which is selected,
// and the nav bounds are all decided by the parent. Day identity is the
// invitee-zone "YYYY-MM-DD" key from lib/time's dayKey, so the grid itself
// needs no timezone math — Date.UTC arithmetic is only used for month shape.

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad2 = (n: number) => String(n).padStart(2, "0");

export function MonthCalendar({
  year,
  month,
  availableDays,
  selectedDay,
  onSelectDay,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  year: number;
  /** 1–12 */
  month: number;
  availableDays: ReadonlySet<string>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = first.getUTCDay();
  const label = first.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex gap-1">
          <NavButton onClick={onPrev} disabled={!canPrev} label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <NavButton onClick={onNext} disabled={!canNext} label="Next month">
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-center text-xs text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: leading }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = `${year}-${pad2(month)}-${pad2(i + 1)}`;
          const available = availableDays.has(day);
          const selected = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              disabled={!available}
              onClick={() => onSelectDay(day)}
              className={cn(
                "aspect-square rounded-md text-sm transition-colors",
                selected
                  ? "bg-primary font-medium text-primary-foreground"
                  : available
                    ? "bg-muted font-medium hover:bg-accent"
                    : "text-muted-foreground/40",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
