import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Copy,
  Home,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Route,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import {
  ApiError,
  addTeamMember,
  connectCalendar,
  createEventType,
  createRoutingForm,
  createSchedule,
  createTeam,
  deleteEventType,
  deleteRoutingForm,
  deleteSchedule,
  disconnectCalendar,
  getMyCalendars,
  getAdminBooking,
  getBookingAssignment,
  listAdminBookings,
  listEventTypes,
  listRoutingForms,
  listSchedules,
  listTeamMembers,
  listTeams,
  listUsers,
  removeTeamMember,
  markBookingNoShow,
  signOut,
  updateEventType,
  updateRoutingForm,
  updateSchedule,
  type AdminEventType,
  type AdminBooking,
  type AdminBookingDetail,
  type AssignmentExplanation,
  type CalendarEntry,
  type DirectoryUser,
  type EventTypeInput,
  type RoutingCondition,
  type RoutingField,
  type RoutingForm,
  type RoutingFormInput,
  type Schedule,
  type ScheduleInput,
  type ScheduleRule,
  type Team,
  type TeamMember,
} from "@/lib/api";
import { themeOptions } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeoplePicker } from "@/components/people-picker";
import { TimezoneSelect } from "@/pages/booking-page";

const TABS = [
  { key: "home", label: "Home", icon: Home, group: "primary" },
  { key: "event-types", label: "Scheduling", icon: CalendarDays, group: "primary" },
  { key: "bookings", label: "Bookings", icon: CalendarRange, group: "primary" },
  { key: "schedules", label: "Availability", icon: Clock3, group: "setup" },
  { key: "routing", label: "Routing", icon: Route, group: "setup" },
  { key: "team", label: "People & teams", icon: Users, group: "setup" },
  { key: "calendars", label: "Calendars", icon: Calendar, group: "setup" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const ERROR_TEXT: Record<string, string> = {
  slug_taken: "That slug is already taken.",
  schedule_in_use: "Event types still use this schedule.",
  event_type_in_use: "This event type has bookings; it can't be deleted.",
  invalid_body: "Some fields are invalid — check the form.",
  team_not_found: "Team not found.",
  form_not_found: "Routing form not found.",
};

function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? `Error: ${e.code}`;
  return "Could not reach the server.";
}

export function DashboardPage() {
  const [tab, setTab] = useState<TabKey>("home");
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((r) => setUsers(r.users))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/sign-in";
          return;
        }
        setError(errorText(e));
      });
  }, []);

  return (
    <div data-organizer className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border/70 bg-card/90 px-3 py-5 backdrop-blur md:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col" aria-label="Organizer">
          <div className="space-y-1">
            {TABS.filter((item) => item.group === "primary").map((item) => (
              <NavButton key={item.key} item={item} active={tab === item.key} onClick={() => setTab(item.key)} />
            ))}
          </div>
          <p className="mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Setup
          </p>
          <div className="space-y-1">
            {TABS.filter((item) => item.group === "setup").map((item) => (
              <NavButton key={item.key} item={item} active={tab === item.key} onClick={() => setTab(item.key)} />
            ))}
          </div>
          <div className="mt-auto border-t border-border/70 pt-3">
            <button
              type="button"
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => void signOut().then(() => (window.location.href = "/sign-in"))}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </nav>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur md:hidden">
        <Brand compact />
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Open setup"
          onClick={() => setTab("schedules")}
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <main className="px-4 pb-24 pt-7 md:ml-60 md:px-8 md:pb-10 md:pt-10">
        <div className="mx-auto max-w-5xl">
          <PageHeading tab={tab} onNavigate={setTab} />
          {error && <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
          {!error && !users && <DashboardSkeleton />}
          {users && (
            <>
              {tab === "home" && <HomeTab onNavigate={setTab} />}
              {tab === "event-types" && <EventTypesTab users={users} />}
              {tab === "bookings" && <BookingsTab users={users} />}
              {tab === "schedules" && <SchedulesTab />}
              {tab === "routing" && <RoutingTab users={users} />}
              {tab === "team" && <TeamTab users={users} />}
              {tab === "calendars" && <CalendarsTab />}
            </>
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border/70 bg-card/95 px-2 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden" aria-label="Primary">
        {[
          TABS[0],
          TABS[1],
          TABS[2],
          { ...TABS[3], label: "More" },
        ].map((item) => {
          const active = item.key === "schedules"
            ? TABS.some((candidate) => candidate.group === "setup" && candidate.key === tab)
            : item.key === tab;
          return (
            <button
              key={item.key}
              type="button"
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setTab(item.key)}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "" : "px-2"}`}>
      <span className="relative grid h-8 w-8 place-items-center rounded-[11px] bg-primary text-primary-foreground">
        <span className="absolute -top-1 left-1.5 h-2.5 w-1.5 rotate-[-18deg] rounded-full bg-primary" />
        <span className="absolute -top-1 right-1.5 h-2.5 w-1.5 rotate-[18deg] rounded-full bg-primary" />
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.02em]">Calpaca</span>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof TABS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition ${
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      onClick={onClick}
    >
      <item.icon className="h-[17px] w-[17px]" />
      {item.label}
    </button>
  );
}

const PAGE_COPY: Record<TabKey, { title: string; description: string }> = {
  home: { title: "Good day", description: "A quiet view of what needs your attention." },
  "event-types": { title: "Scheduling", description: "Booking links and the people behind them." },
  bookings: { title: "Bookings", description: "Upcoming conversations and recent history." },
  schedules: { title: "Availability", description: "The recurring hours your booking links can offer." },
  routing: { title: "Routing", description: "Send each invitee to the right conversation." },
  team: { title: "People & teams", description: "Hosts, membership, and shared scheduling." },
  calendars: { title: "Calendars", description: "Where Calpaca checks conflicts and writes events." },
};

function PageHeading({ tab, onNavigate }: { tab: TabKey; onNavigate: (tab: TabKey) => void }) {
  const copy = PAGE_COPY[tab];
  return (
    <header className="mb-7">
      <h1 className="text-[28px] font-semibold tracking-[-0.035em] sm:text-[32px]">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      {TABS.find((item) => item.key === tab)?.group === "setup" && (
        <div className="mt-5 flex gap-1 overflow-x-auto pb-1 md:hidden">
          {TABS.filter((item) => item.group === "setup").map((item) => (
            <button
              type="button"
              key={item.key}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${item.key === tab ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-muted" />)}
    </div>
  );
}

function viewerTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatBookingDate(utc: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options ?? {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(utc));
}

function formatBookingTime(utc: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(utc));
}

function HomeTab({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const [next, setNext] = useState<AdminBooking | null | undefined>(undefined);
  const [past, setPast] = useState<AdminBooking[]>([]);
  const timezone = viewerTimezone();

  useEffect(() => {
    void Promise.all([
      listAdminBookings({ filter: "upcoming", pageSize: 1, timezone }),
      listAdminBookings({ filter: "past", pageSize: 50, timezone }),
    ]).then(([upcoming, history]) => {
      setNext(upcoming.bookings[0] ?? null);
      setPast(history.bookings);
    }).catch(() => {
      setNext(null);
    });
  }, [timezone]);

  const completed = past.filter((booking) => booking.status !== "cancelled");
  const noShows = past.filter((booking) => booking.status === "no_show").length;
  const failed = past.filter((booking) => booking.inviteStatus === "failed").length;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Up next</p>
              <p className="mt-1 text-sm text-muted-foreground">Your nearest confirmed booking</p>
            </div>
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div className="p-5">
            {next === undefined ? (
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
            ) : next ? (
              <button type="button" className="w-full text-left" onClick={() => onNavigate("bookings")}>
                <p className="text-2xl font-semibold tracking-[-0.03em]">
                  {formatBookingTime(next.start.utc)}
                </p>
                <p className="mt-1 font-medium">{next.inviteeName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatBookingDate(next.start.utc)} · {next.eventType.title}
                </p>
              </button>
            ) : (
              <div className="py-3">
                <p className="font-medium">Wide open.</p>
                <p className="mt-1 text-sm text-muted-foreground">Your future self says thanks.</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="group rounded-xl border border-border/70 bg-primary p-5 text-left text-primary-foreground transition hover:opacity-95"
          onClick={() => onNavigate("event-types")}
        >
          <Plus className="h-5 w-5" />
          <p className="mt-8 text-lg font-semibold">Create a booking link</p>
          <p className="mt-1 text-sm opacity-75">A fresh way for people to find you.</p>
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Recent meetings" value={completed.length} />
        <Metric label="No-show rate" value={completed.length ? `${Math.round((noShows / completed.length) * 100)}%` : "—"} />
        <Metric className="col-span-2 sm:col-span-1" label="Delivery issues" value={failed} tone={failed ? "danger" : "normal"} />
      </section>

      <section className="rounded-xl border border-border/70 bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">{failed ? `${failed} delivery issue${failed === 1 ? "" : "s"} need attention` : "Everything is in step."}</p>
            <p className="text-xs text-muted-foreground">
              {failed ? "Open Bookings to review failed invitations." : "Calendars and recent invitation delivery look healthy."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "normal",
  className = "",
}: {
  label: string;
  value: string | number;
  tone?: "normal" | "danger";
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/70 bg-card p-4 ${className}`}>
      <p className={`text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function BookingsTab({ users }: { users: DirectoryUser[] }) {
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timezone = viewerTimezone();

  const reload = useCallback(() => {
    setBookings(null);
    setError(null);
    listAdminBookings({ filter, pageSize: 100, timezone })
      .then((response) => setBookings(response.bookings))
      .catch((cause: unknown) => setError(errorText(cause)));
  }, [filter, timezone]);

  useEffect(() => reload(), [reload]);

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {(["upcoming", "past"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded-md px-4 py-2 text-sm capitalize transition ${
                filter === value ? "bg-card font-medium shadow-sm" : "text-muted-foreground"
              }`}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">{timezone}</p>
      </div>

      {error && <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {!error && bookings === null && <DashboardSkeleton />}
      {bookings?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <CalendarRange className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-medium">No {filter} bookings</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter === "upcoming" ? "A little room to breathe." : "Your meeting history will collect here."}
          </p>
        </div>
      )}
      {bookings && bookings.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          {bookings.map((booking, index) => {
            const previous = bookings[index - 1];
            const day = formatBookingDate(booking.start.utc, {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
            const previousDay = previous
              ? formatBookingDate(previous.start.utc, { weekday: "long", month: "long", day: "numeric" })
              : null;
            return (
              <div key={booking.id}>
                {day !== previousDay && (
                  <p className="border-b border-border/60 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:px-5">
                    {day}
                  </p>
                )}
                <button
                  type="button"
                  className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 border-b border-border/60 px-4 py-4 text-left last:border-0 transition hover:bg-muted/40 sm:grid-cols-[6rem_1fr_auto] sm:px-5"
                  onClick={() => setSelected(booking.id)}
                >
                  <span className="text-sm font-semibold tabular-nums">{formatBookingTime(booking.start.utc)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{booking.inviteeName}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{booking.eventType.title}</span>
                  </span>
                  <BookingStatus booking={booking} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <BookingDetailPanel
          bookingId={selected}
          timezone={timezone}
          users={users}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

function BookingStatus({ booking }: { booking: AdminBooking }) {
  if (booking.inviteStatus === "failed") {
    return <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">Invite failed</span>;
  }
  const styles = booking.status === "confirmed"
    ? "bg-primary/10 text-primary"
    : booking.status === "no_show"
      ? "bg-warning/20 text-warning-foreground"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${styles}`}>
      {booking.status.replace("_", " ")}
    </span>
  );
}

function BookingDetailPanel({
  bookingId,
  timezone,
  users,
  onClose,
  onChanged,
}: {
  bookingId: string;
  timezone: string;
  users: DirectoryUser[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [booking, setBooking] = useState<AdminBookingDetail | null>(null);
  const [assignment, setAssignment] = useState<AssignmentExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAdminBooking(bookingId, timezone)
      .then(setBooking)
      .catch((cause: unknown) => setError(errorText(cause)));
    void getBookingAssignment(bookingId)
      .then((response) => setAssignment(response.assignment))
      .catch((cause: unknown) => {
        if (!(cause instanceof ApiError && cause.status === 404)) setError(errorText(cause));
      });
  }, [bookingId, timezone]);

  const names = new Map(users.map((user) => [user.id, user.name]));
  const markNoShow = async () => {
    if (!window.confirm("Mark this booking as a no-show? This will notify subscribed webhooks.")) return;
    try {
      await markBookingNoShow(bookingId);
      onChanged();
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-foreground/20 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Booking details">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close booking details" onClick={onClose} />
      <section className="relative z-10 h-full w-full overflow-y-auto bg-background p-5 shadow-2xl sm:max-w-xl sm:border-l sm:border-border sm:p-7">
        <div className="mb-6 flex items-center justify-between">
          <button type="button" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={onClose}>← Back</button>
          {booking && <BookingStatus booking={booking} />}
        </div>
        {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {!booking && !error && <DashboardSkeleton />}
        {booking && (
          <div className="space-y-7">
            <header>
              <p className="text-sm text-muted-foreground">{booking.eventType.title}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{booking.inviteeName}</h2>
              <p className="mt-2 text-sm">
                {formatBookingDate(booking.start.utc, { weekday: "long", month: "long", day: "numeric" })}
                {" · "}{formatBookingTime(booking.start.utc)}–{formatBookingTime(booking.end.utc)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{timezone}</p>
            </header>

            <DetailSection title="Invitee">
              <p className="text-sm">{booking.inviteeEmail}</p>
              {booking.inviteeNotes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{booking.inviteeNotes}</p>}
            </DetailSection>

            <DetailSection title="Delivery">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 capitalize">Invite {booking.inviteStatus}</span>
                <span className="rounded-full bg-muted px-2.5 py-1">
                  {booking.hasGoogleEvent ? "Google event created" : "Calendar email fallback"}
                </span>
              </div>
            </DetailSection>

            <DetailSection title="Hosts">
              <p className="text-sm">{booking.hostUserIds.map((id) => names.get(id) ?? id).join(", ")}</p>
            </DetailSection>

            {assignment && (
              <DetailSection title="Round-robin assignment">
                <p className="text-sm">
                  <strong>{names.get(assignment.winnerUserId) ?? assignment.winnerUserId}</strong>
                  {" "}was selected: {assignment.reason.replaceAll("_", " ")}.
                </p>
                <div className="mt-3 space-y-2">
                  {assignment.candidates.map((candidate, index) => (
                    <div key={candidate.userId} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                      <span>{index + 1}. {names.get(candidate.userId) ?? candidate.userId}</span>
                      <span className="tabular-nums text-muted-foreground">{candidate.bookingCount} bookings · {candidate.effectiveLoad.toFixed(2)} load</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {booking.routingAnswers && (
              <DetailSection title="Routing answers">
                <dl className="space-y-2">
                  {Object.entries(booking.routingAnswers).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[8rem_1fr] gap-3 text-sm">
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd>{Array.isArray(value) ? value.join(", ") : value}</dd>
                    </div>
                  ))}
                </dl>
              </DetailSection>
            )}

            <DetailSection title="Timeline">
              <ol className="relative ml-1 border-l border-border pl-5">
                {booking.events.map((event, index) => (
                  <li key={`${event.kind}-${event.createdAt}-${index}`} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[1.42rem] top-1 h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                    <p className="text-sm font-medium capitalize">{event.kind.replaceAll("_", " ")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatBookingDate(event.createdAt, { month: "short", day: "numeric", year: "numeric" })} · {formatBookingTime(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </DetailSection>

            {booking.status === "confirmed" && new Date(booking.end.utc).getTime() < Date.now() && (
              <div className="border-t border-border pt-6">
                <Button variant="outline" className="text-destructive" onClick={() => void markNoShow()}>
                  Mark no-show
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

// ---- event types ----

const DEFAULT_EVENT_TYPE: EventTypeInput = {
  slug: "",
  title: "",
  durationMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  teamId: null,
  theme: "default",
  hosts: [],
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function EventTypesTab({ users }: { users: DirectoryUser[] }) {
  const [eventTypes, setEventTypes] = useState<AdminEventType[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: EventTypeInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(() => {
    listEventTypes()
      .then((r) => setEventTypes(r.eventTypes))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    reload();
    listSchedules().then((r) => setSchedules(r.schedules)).catch(() => undefined);
    listTeams().then((r) => setTeams(r.teams)).catch(() => undefined);
  }, [reload]);

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.id) await updateEventType(editing.id, editing.form);
      else await createEventType(editing.form);
      setEditing(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteEventType(id);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/book/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-xl">Event types</CardTitle>
          <CardDescription>What invitees can book, and with whom.</CardDescription>
        </div>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({ id: null, form: DEFAULT_EVENT_TYPE })}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {editing ? (
          <EventTypeForm
            form={editing.form}
            users={users}
            schedules={schedules}
            teams={teams}
            onChange={(form) => setEditing({ ...editing, form })}
            onCancel={() => setEditing(null)}
            onSave={() => void save()}
          />
        ) : !eventTypes ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : eventTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No event types yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventTypes.map((et) => (
              <li
                key={et.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 grow basis-full sm:basis-0">
                  <span className="font-medium">{et.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    /{et.slug} · {et.durationMinutes} min · {et.mode.replace("_", " ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copyLink(et.slug)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {copied === et.slug ? "Copied" : "Link"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${et.title}`}
                    onClick={() =>
                      setEditing({
                        id: et.id,
                        form: {
                          slug: et.slug,
                          title: et.title,
                          durationMinutes: et.durationMinutes,
                          bufferBeforeMin: et.bufferBeforeMin,
                          bufferAfterMin: et.bufferAfterMin,
                          minimumNoticeMin: et.minimumNoticeMin,
                          rollingWindowDays: et.rollingWindowDays,
                          mode: et.mode,
                          scheduleId: et.scheduleId,
                          teamId: et.teamId,
                          theme: et.theme,
                          hosts: et.hosts.map(({ userId, role, weight }) => ({
                            userId,
                            role,
                            weight,
                          })),
                        },
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${et.title}`}
                    onClick={() => void remove(et.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EventTypeForm({
  form,
  users,
  schedules,
  teams,
  onChange,
  onCancel,
  onSave,
}: {
  form: EventTypeInput;
  users: DirectoryUser[];
  schedules: Schedule[];
  teams: Team[];
  onChange: (form: EventTypeInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof EventTypeInput>(key: K, value: EventTypeInput[K]) =>
    onChange({ ...form, [key]: value });

  const requiredHosts = form.hosts.filter((h) => h.role !== "optional").map((h) => h.userId);
  const optionalHosts = form.hosts.filter((h) => h.role === "optional").map((h) => h.userId);

  const setHosts = (required: string[], optional: string[]) => {
    const role = form.mode === "group" ? ("required" as const) : ("member" as const);
    set("hosts", [
      ...required.map((userId) => ({ userId, role, weight: 100 })),
      ...optional.map((userId) => ({ userId, role: "optional" as const, weight: 100 })),
    ]);
  };

  const canSave =
    form.title.trim() !== "" &&
    form.slug.trim() !== "" &&
    form.hosts.length >= 1 &&
    (form.mode !== "solo" || form.hosts.length === 1);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-title">Title</Label>
          <Input
            id="et-title"
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              const slugWasDerived = form.slug === slugify(form.title);
              onChange({ ...form, title, slug: slugWasDerived ? slugify(title) : form.slug });
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-slug">Slug</Label>
          <Input
            id="et-slug"
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="intro-call"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-duration">Duration (min)</Label>
          <Input
            id="et-duration"
            type="number"
            min={5}
            max={480}
            value={form.durationMinutes}
            onChange={(e) => set("durationMinutes", Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-mode">Mode</Label>
          <select
            id="et-mode"
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={form.mode}
            onChange={(e) => set("mode", e.target.value as EventTypeInput["mode"])}
          >
            <option value="solo">Solo</option>
            <option value="round_robin">Round robin</option>
            <option value="group">Group (all hosts)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-buffer-before">Buffer before (min)</Label>
          <Input
            id="et-buffer-before"
            type="number"
            min={0}
            max={240}
            value={form.bufferBeforeMin}
            onChange={(e) => set("bufferBeforeMin", Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-buffer-after">Buffer after (min)</Label>
          <Input
            id="et-buffer-after"
            type="number"
            min={0}
            max={240}
            value={form.bufferAfterMin}
            onChange={(e) => set("bufferAfterMin", Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-notice">Minimum notice (min)</Label>
          <Input
            id="et-notice"
            type="number"
            min={0}
            max={10080}
            value={form.minimumNoticeMin}
            onChange={(e) => set("minimumNoticeMin", Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-window">Booking window (days)</Label>
          <Input
            id="et-window"
            type="number"
            min={1}
            max={90}
            value={form.rollingWindowDays}
            onChange={(e) => set("rollingWindowDays", Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-schedule">Schedule</Label>
          <select
            id="et-schedule"
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={form.scheduleId ?? ""}
            onChange={(e) => set("scheduleId", e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Host default</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-theme">Theme</Label>
          <select
            id="et-theme"
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={form.theme}
            onChange={(e) => set("theme", e.target.value)}
          >
            {themeOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-team">Team</Label>
          <select
            id="et-team"
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={form.teamId ?? ""}
            onChange={(e) => set("teamId", e.target.value === "" ? null : e.target.value)}
          >
            <option value="">Personal</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{form.mode === "group" ? "Required hosts" : "Hosts"}</Label>
        <PeoplePicker
          users={users}
          selected={requiredHosts}
          max={form.mode === "solo" ? 1 : undefined}
          onChange={(ids) => setHosts(ids, optionalHosts)}
        />
      </div>
      {form.mode === "group" && (
        <div className="flex flex-col gap-1.5">
          <Label>Optional attendees</Label>
          <PeoplePicker
            users={users}
            selected={optionalHosts}
            onChange={(ids) => setHosts(requiredHosts, ids)}
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---- schedules ----

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SCHEDULE: ScheduleInput = {
  name: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  rules: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" })),
};

function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: ScheduleInput } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listSchedules()
      .then((r) => setSchedules(r.schedules))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => reload(), [reload]);

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.id) await updateSchedule(editing.id, editing.form);
      else await createSchedule(editing.form);
      setEditing(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteSchedule(id);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-xl">Schedules</CardTitle>
          <CardDescription>Weekly working hours, in a named timezone.</CardDescription>
        </div>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({ id: null, form: DEFAULT_SCHEDULE })}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {editing ? (
          <ScheduleForm
            form={editing.form}
            onChange={(form) => setEditing({ ...editing, form })}
            onCancel={() => setEditing(null)}
            onSave={() => void save()}
          />
        ) : !schedules ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {schedules.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="flex-1">
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.timezone} · {s.rules.length} rule{s.rules.length === 1 ? "" : "s"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${s.name}`}
                  onClick={() =>
                    setEditing({
                      id: s.id,
                      form: { name: s.name, timezone: s.timezone, rules: s.rules },
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void remove(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleForm({
  form,
  onChange,
  onCancel,
  onSave,
}: {
  form: ScheduleInput;
  onChange: (form: ScheduleInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const ruleFor = (dow: number): ScheduleRule | undefined => form.rules.find((r) => r.dow === dow);

  const toggleDay = (dow: number) => {
    const existing = ruleFor(dow);
    onChange({
      ...form,
      rules: existing
        ? form.rules.filter((r) => r.dow !== dow)
        : [...form.rules, { dow, start: "09:00", end: "17:00" }].sort((a, b) => a.dow - b.dow),
    });
  };

  const setTime = (dow: number, key: "start" | "end", value: string) => {
    onChange({
      ...form,
      rules: form.rules.map((r) => (r.dow === dow ? { ...r, [key]: value } : r)),
    });
  };

  const valid =
    form.name.trim() !== "" && form.rules.length > 0 && form.rules.every((r) => r.start < r.end);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sched-name">Name</Label>
          <Input
            id="sched-name"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="Working hours"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label>Timezone</Label>
          <div className="flex h-9 min-w-0 items-center rounded-md border border-border bg-card px-3">
            <TimezoneSelect
              value={form.timezone}
              onChange={(timezone) => onChange({ ...form, timezone })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {DOW_LABELS.map((label, dow) => {
          const rule = ruleFor(dow);
          return (
            <div key={label} className="flex items-center gap-2 text-sm sm:gap-3">
              <label className="flex w-14 shrink-0 items-center gap-2 sm:w-16">
                <input type="checkbox" checked={!!rule} onChange={() => toggleDay(dow)} />
                {label}
              </label>
              {rule ? (
                <>
                  <Input
                    type="time"
                    className="w-full min-w-0 sm:w-32"
                    value={rule.start}
                    aria-label={`${label} start`}
                    onChange={(e) => setTime(dow, "start", e.target.value)}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    className="w-full min-w-0 sm:w-32"
                    value={rule.end}
                    aria-label={`${label} end`}
                    onChange={(e) => setTime(dow, "end", e.target.value)}
                  />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Unavailable</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!valid}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---- routing forms ----

// The rule builder edits a flat ANDed clause list; anything richer (or/not/in,
// nested and) was written via the API and is preserved untouched.
type RoutingClause = { field: string; op: "eq" | "ne" | "contains"; value: string };

function toClauses(c: RoutingCondition): RoutingClause[] | null {
  if (c.kind === "always") return [];
  if (c.kind === "eq" || c.kind === "ne" || c.kind === "contains") {
    return [{ field: c.field, op: c.kind, value: c.value }];
  }
  if (c.kind === "and") {
    const parts = c.all.map(toClauses);
    if (parts.some((p) => p === null || p.length !== 1)) return null;
    return parts.flatMap((p) => p ?? []);
  }
  return null;
}

function fromClauses(clauses: RoutingClause[]): RoutingCondition {
  if (clauses.length === 0) return { kind: "always" };
  const conds: RoutingCondition[] = clauses.map((cl) => ({
    kind: cl.op,
    field: cl.field,
    value: cl.value,
  }));
  return conds.length === 1 && conds[0] ? conds[0] : { kind: "and", all: conds };
}

const DEFAULT_ROUTING_FORM: RoutingFormInput = {
  slug: "",
  teamId: null,
  fields: [{ key: "", label: "", type: "text", required: true }],
  rules: [],
};

function RoutingTab({ users }: { users: DirectoryUser[] }) {
  const [forms, setForms] = useState<RoutingForm[] | null>(null);
  const [eventTypes, setEventTypes] = useState<AdminEventType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: RoutingFormInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(() => {
    listRoutingForms()
      .then((r) => setForms(r.forms))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    reload();
    listEventTypes().then((r) => setEventTypes(r.eventTypes)).catch(() => undefined);
    listTeams().then((r) => setTeams(r.teams)).catch(() => undefined);
  }, [reload]);

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.id) await updateRoutingForm(editing.id, editing.form);
      else await createRoutingForm(editing.form);
      setEditing(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteRoutingForm(id);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/r/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-xl">Routing forms</CardTitle>
          <CardDescription>Ask invitees questions, send them to the right booking page.</CardDescription>
        </div>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({ id: null, form: DEFAULT_ROUTING_FORM })}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {editing ? (
          <RoutingFormEditor
            form={editing.form}
            users={users}
            eventTypes={eventTypes}
            teams={teams}
            onChange={(form) => setEditing({ ...editing, form })}
            onCancel={() => setEditing(null)}
            onSave={() => void save()}
          />
        ) : !forms ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routing forms yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {forms.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="flex-1">
                  <span className="font-medium">/{f.slug}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {f.fields.length} field{f.fields.length === 1 ? "" : "s"} · {f.rules.length} rule
                    {f.rules.length === 1 ? "" : "s"}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => copyLink(f.slug)}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {copied === f.slug ? "Copied" : "Link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${f.slug}`}
                  onClick={() =>
                    setEditing({
                      id: f.id,
                      form: {
                        slug: f.slug,
                        teamId: f.teamId,
                        fields: f.fields,
                        rules: f.rules.map(({ priority, condition, targetEventTypeId, targetHostUserId }) => ({
                          priority,
                          condition,
                          targetEventTypeId,
                          targetHostUserId,
                        })),
                      },
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${f.slug}`}
                  onClick={() => void remove(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const FIELD_TYPES: { value: RoutingField["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "select", label: "Select" },
  { value: "multiselect", label: "Multi-select" },
];

function RoutingFormEditor({
  form,
  users,
  eventTypes,
  teams,
  onChange,
  onCancel,
  onSave,
}: {
  form: RoutingFormInput;
  users: DirectoryUser[];
  eventTypes: AdminEventType[];
  teams: Team[];
  onChange: (form: RoutingFormInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const setField = (i: number, patch: Partial<RoutingField>) => {
    onChange({
      ...form,
      fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    });
  };

  const setRule = (i: number, patch: Partial<RoutingFormInput["rules"][number]>) => {
    onChange({
      ...form,
      rules: form.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
  };

  const fieldKeys = form.fields.map((f) => f.key).filter((k) => k !== "");
  const optionsOk = (f: RoutingField) =>
    (f.type !== "select" && f.type !== "multiselect") || (f.options ?? []).length > 0;
  const canSave =
    /^[a-z0-9-]+$/.test(form.slug) &&
    form.fields.length >= 1 &&
    form.fields.every((f) => /^[a-z0-9_]+$/.test(f.key) && f.label.trim() !== "" && optionsOk(f)) &&
    new Set(fieldKeys).size === form.fields.length &&
    form.rules.every((r) => r.targetEventTypeId !== null || r.targetHostUserId !== null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-slug">Slug</Label>
          <Input
            id="rf-slug"
            value={form.slug}
            onChange={(e) => onChange({ ...form, slug: e.target.value })}
            placeholder="contact-sales"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-team">Team</Label>
          <select
            id="rf-team"
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={form.teamId ?? ""}
            onChange={(e) => onChange({ ...form, teamId: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">Personal</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Questions</Label>
        {form.fields.map((field, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                aria-label={`Field ${i + 1} label`}
                placeholder="Label (shown to invitees)"
                value={field.label}
                onChange={(e) => {
                  const label = e.target.value;
                  const keyWasDerived = field.key === snakeKey(field.label);
                  setField(i, { label, ...(keyWasDerived ? { key: snakeKey(label) } : {}) });
                }}
              />
              <Input
                aria-label={`Field ${i + 1} key`}
                placeholder="key_in_snake_case"
                value={field.key}
                onChange={(e) => setField(i, { key: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                aria-label={`Field ${i + 1} type`}
                className="flex h-9 rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
                value={field.type}
                onChange={(e) => {
                  const type = e.target.value as RoutingField["type"];
                  setField(i, {
                    type,
                    options: type === "select" || type === "multiselect" ? (field.options ?? []) : undefined,
                  });
                }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => setField(i, { required: e.target.checked })}
                />
                Required
              </label>
              <span className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove field ${i + 1}`}
                onClick={() => onChange({ ...form, fields: form.fields.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {(field.type === "select" || field.type === "multiselect") && (
              <Input
                aria-label={`Field ${i + 1} options`}
                placeholder="Options, comma separated"
                value={(field.options ?? []).join(", ")}
                onChange={(e) =>
                  setField(i, {
                    options: e.target.value
                      .split(",")
                      .map((o) => o.trim())
                      .filter((o) => o !== ""),
                  })
                }
              />
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({
              ...form,
              fields: [...form.fields, { key: "", label: "", type: "text", required: true }],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add question
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Rules (lowest priority number wins)</Label>
        {form.rules.map((rule, i) => (
          <RoutingRuleEditor
            key={i}
            rule={rule}
            index={i}
            fieldKeys={fieldKeys}
            users={users}
            eventTypes={eventTypes}
            onChange={(patch) => setRule(i, patch)}
            onRemove={() => onChange({ ...form, rules: form.rules.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({
              ...form,
              rules: [
                ...form.rules,
                {
                  priority: (form.rules.length + 1) * 10,
                  condition: { kind: "always" },
                  targetEventTypeId: null,
                  targetHostUserId: null,
                },
              ],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add rule
        </Button>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function snakeKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CLAUSE_OPS: { value: RoutingClause["op"]; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "contains", label: "contains" },
];

function RoutingRuleEditor({
  rule,
  index,
  fieldKeys,
  users,
  eventTypes,
  onChange,
  onRemove,
}: {
  rule: RoutingFormInput["rules"][number];
  index: number;
  fieldKeys: string[];
  users: DirectoryUser[];
  eventTypes: AdminEventType[];
  onChange: (patch: Partial<RoutingFormInput["rules"][number]>) => void;
  onRemove: () => void;
}) {
  const clauses = toClauses(rule.condition);

  const setClauses = (next: RoutingClause[]) => onChange({ condition: fromClauses(next) });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        <Label htmlFor={`rule-${index}-priority`} className="text-xs text-muted-foreground">
          Priority
        </Label>
        <Input
          id={`rule-${index}-priority`}
          type="number"
          min={0}
          max={1000}
          className="w-24"
          value={rule.priority}
          onChange={(e) => onChange({ priority: Number(e.target.value) })}
        />
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove rule ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {clauses === null ? (
        <p className="text-xs text-muted-foreground">
          Custom condition (edited via the API) — kept as is.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {clauses.length === 0 && (
            <p className="text-xs text-muted-foreground">Always matches (catch-all).</p>
          )}
          {clauses.map((clause, ci) => (
            <div key={ci} className="flex items-center gap-2">
              <select
                aria-label={`Rule ${index + 1} clause ${ci + 1} field`}
                className="flex h-9 rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
                value={clause.field}
                onChange={(e) =>
                  setClauses(clauses.map((c, j) => (j === ci ? { ...c, field: e.target.value } : c)))
                }
              >
                {!fieldKeys.includes(clause.field) && <option value={clause.field}>{clause.field || "—"}</option>}
                {fieldKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Rule ${index + 1} clause ${ci + 1} operator`}
                className="flex h-9 rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
                value={clause.op}
                onChange={(e) =>
                  setClauses(
                    clauses.map((c, j) =>
                      j === ci ? { ...c, op: e.target.value as RoutingClause["op"] } : c,
                    ),
                  )
                }
              >
                {CLAUSE_OPS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <Input
                aria-label={`Rule ${index + 1} clause ${ci + 1} value`}
                className="flex-1"
                value={clause.value}
                onChange={(e) =>
                  setClauses(clauses.map((c, j) => (j === ci ? { ...c, value: e.target.value } : c)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove rule ${index + 1} clause ${ci + 1}`}
                onClick={() => setClauses(clauses.filter((_, j) => j !== ci))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setClauses([...clauses, { field: fieldKeys[0] ?? "", op: "eq", value: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rule-${index}-target`} className="text-xs text-muted-foreground">
            Send to event type
          </Label>
          <select
            id={`rule-${index}-target`}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={rule.targetEventTypeId ?? ""}
            onChange={(e) => onChange({ targetEventTypeId: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">—</option>
            {eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rule-${index}-host`} className="text-xs text-muted-foreground">
            Prefer host (optional)
          </Label>
          <select
            id={`rule-${index}-host`}
            className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
            value={rule.targetHostUserId ?? ""}
            onChange={(e) => onChange({ targetHostUserId: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ---- team ----

function TeamTab({ users }: { users: DirectoryUser[] }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listTeams()
      .then((r) => setTeams(r.teams))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => reload(), [reload]);

  const create = async () => {
    setError(null);
    try {
      await createTeam({ name, slug });
      setCreating(false);
      setName("");
      setSlug("");
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-xl">Teams</CardTitle>
          <CardDescription>Round-robin and group event types belong to a team.</CardDescription>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {creating && (
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  const slugWasDerived = slug === slugify(name);
                  setName(next);
                  if (slugWasDerived) setSlug(slugify(next));
                }}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="team-slug">Slug</Label>
              <Input id="team-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
            <Button type="submit" disabled={name.trim() === "" || slug.trim() === ""}>
              Create
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </form>
        )}
        {!teams ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          teams.map((team) => <TeamMembers key={team.id} team={team} users={users} />)
        )}
      </CardContent>
    </Card>
  );
}

function TeamMembers({ team, users }: { team: Team; users: DirectoryUser[] }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listTeamMembers(team.id)
      .then((r) => setMembers(r.members))
      .catch((e: unknown) => setError(errorText(e)));
  }, [team.id]);

  useEffect(() => reload(), [reload]);

  const add = async (userIds: string[]) => {
    const memberIds = (members ?? []).map((m) => m.userId);
    const added = userIds.find((id) => !memberIds.includes(id));
    if (!added) return;
    setError(null);
    try {
      await addTeamMember(team.id, added);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (userId: string) => {
    setError(null);
    try {
      await removeTeamMember(team.id, userId);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-sm font-medium">
        {team.name} <span className="text-xs font-normal text-muted-foreground">/{team.slug}</span>
      </p>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {!members ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <ul className="mb-3 flex flex-col gap-1.5">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {m.name}
                  <span className="ml-2 text-xs text-muted-foreground">{m.email}</span>
                  {m.isAdmin && <span className="ml-2 text-xs text-muted-foreground">admin</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${m.name} from ${team.name}`}
                  onClick={() => void remove(m.userId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <PeoplePicker
            users={users}
            selected={members.map((m) => m.userId)}
            onChange={(ids) => void add(ids)}
            hideSelected
          />
        </>
      )}
    </div>
  );
}

// ---- calendars ----

function CalendarsTab() {
  const [calendars, setCalendars] = useState<CalendarEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getMyCalendars()
      .then((r) => setCalendars(r.calendars))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggle(cal: CalendarEntry) {
    setBusyId(cal.id);
    setError(null);
    try {
      if (cal.connectionId) await disconnectCalendar(cal.connectionId);
      else await connectCalendar(cal.id);
      refresh();
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Your calendars</CardTitle>
        <CardDescription>Busy times sync from connected calendars.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {!error && !calendars && <p className="text-sm text-muted-foreground">Loading…</p>}
        {calendars && (
          <ul className="flex flex-col gap-2">
            {calendars.map((cal) => (
              <li
                key={cal.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
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
                <Button
                  size="sm"
                  variant={cal.connected ? "outline" : "default"}
                  disabled={busyId !== null}
                  onClick={() => void toggle(cal)}
                >
                  {busyId === cal.id ? "…" : cal.connected ? "Stop syncing" : "Sync"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
