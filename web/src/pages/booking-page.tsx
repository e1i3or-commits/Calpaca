import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarCheck, Check, Clock, Globe, Plus, Phone, Trash2, UserPlus, Video, X } from "lucide-react";
import {
  ApiError,
  confirmBooking,
  createHold,
  getEventTypeMeta,
  startInviteeCalendarConnection,
  getInviteeCalendarStatus,
  disconnectInviteeCalendar,
  suggestTimes,
  type BookingConfirmation,
  type BookingAnswers,
  type BookingQuestion,
  type EventTypeMeta,
  type EventTypeProfile,
  type EventLocation,
  type RoutingAnswers,
  type SlotDto,
} from "@/lib/api";
import { useBookingLayout, useTheme } from "@/lib/theme";
import {
  allTimezones,
  browserTimezone,
  currentLocalDateTime,
  formatDayTime,
  formatTime,
  isFutureInstant,
  localSuggestionWindow,
} from "@/lib/time";
import { SlotPicker } from "@/components/slot-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Step =
  | { name: "pick" }
  | { name: "details"; slot: SlotDto; hosts?: string[]; optionalHosts?: string[] }
  | { name: "confirmed"; slot: SlotDto; confirmation: BookingConfirmation }
  | { name: "suggest" }
  | { name: "suggested"; email: string };

const ERROR_MESSAGES: Record<string, string> = {
  event_type_not_found: "This booking link doesn't exist.",
  slot_not_available: "That time was just taken. Pick another one.",
  slot_taken: "That time was just taken. Pick another one.",
  expired: "The hold on that time expired. Pick it again.",
  hosts_not_selectable: "That host selection is no longer available. Refresh and choose again.",
  invalid_request: "Check the form and try again.",
  invalid_slots: "Choose future times and try again.",
  rate_limited: "Too many suggestions were sent. Please wait a minute and try again.",
  invalid_booking_answers: "Check the booking questions and try again.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERROR_MESSAGES[e.code] ?? `Something went wrong (${e.code}).`;
  return "Could not reach the server.";
}

export function BookingPage({
  slug,
  workspaceSlug,
  routingAnswers,
}: {
  slug: string;
  workspaceSlug?: string;
  /** present when the invitee arrived via a routing form (/r/<form>) */
  routingAnswers?: RoutingAnswers;
}) {
  const [timezone, setTimezone] = useState(browserTimezone());
  const [step, setStep] = useState<Step>({ name: "pick" });
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<EventTypeMeta | null>(null);
  const [hostRoles, setHostRoles] = useState<Record<string, "required" | "optional">>({});
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarExpiresAt, setCalendarExpiresAt] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

  useEffect(() => {
    if (window.parent === window) return;
    const sendHeight = () => {
      window.parent.postMessage({
        type: "calpaca:resize",
        height: document.documentElement.scrollHeight,
      }, "*");
    };
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.documentElement);
    sendHeight();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const returnedToken = fragment.get("calendarSession");
    const returnedError = fragment.get("calendarError");
    if (returnedToken) sessionStorage.setItem("calpaca:invitee-calendar", returnedToken);
    if (returnedError) setError("Could not connect that calendar. Try again.");
    if (returnedToken || returnedError) history.replaceState(null, "", `${location.pathname}${location.search}`);
    const capability = returnedToken ?? sessionStorage.getItem("calpaca:invitee-calendar");
    if (!capability) return;
    getInviteeCalendarStatus(capability).then((status) => {
      if (status.connected) {
        setCalendarToken(capability);
        setCalendarExpiresAt(status.expiresAt ?? null);
      } else {
        sessionStorage.removeItem("calpaca:invitee-calendar");
      }
    }, () => {});
  }, []);

  // real title + theme; a failure here is cosmetic (the slug stands in and
  // the availability load reports the 404), so it's deliberately swallowed
  useEffect(() => {
    getEventTypeMeta(slug, workspaceSlug).then(setMeta, () => {});
  }, [slug, workspaceSlug]);
  useEffect(() => {
    if (!meta?.selectableHosts) return;
    setHostRoles(
      Object.fromEntries(meta.selectableHosts.map((host) => [host.id, host.role])),
    );
  }, [meta?.selectableHosts]);
  useTheme(meta?.theme);
  const layout = useBookingLayout(meta?.layout);

  const selectedHostIds = useMemo(
    () =>
      meta?.selectableHosts
        ?.filter((host) => host.id in hostRoles)
        .map((host) => host.id) ?? [],
    [meta?.selectableHosts, hostRoles],
  );
  const optionalHostIds = useMemo(
    () => selectedHostIds.filter((id) => hostRoles[id] === "optional"),
    [selectedHostIds, hostRoles],
  );

  function changeHostRoles(next: Record<string, "required" | "optional">) {
    setHostRoles(next);
    setStep({ name: "pick" });
    setError(null);
    setReloadKey((key) => key + 1);
  }

  if (step.name === "confirmed") {
    return <Confirmation slot={step.slot} confirmation={step.confirmation} timezone={timezone} layout={layout} />;
  }
  if (step.name === "suggested") {
    const recipient =
      meta?.profile?.teamName ??
      meta?.profile?.hosts.map((host) => host.name).join(", ") ??
      "The host";
    return (
      <SuggestionConfirmation
        email={step.email}
        recipient={recipient}
        layout={layout}
      />
    );
  }

  return (
    <div className="booking-shell mx-auto px-4 py-10" data-booking-layout={layout}>
      <Card className="booking-card">
        <CardHeader className="booking-header">
          {meta?.logoUrl && (
            <img src={meta.logoUrl} alt="" className="mb-3 max-h-9 max-w-44 object-contain object-left" />
          )}
          {meta?.profile && <ProfileHeader profile={meta.profile} />}
          <CardTitle className="text-xl">{meta?.title ?? slug.replace(/-/g, " ")}</CardTitle>
          {meta?.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {meta.description}
            </p>
          )}
          <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {meta && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {meta.durationMinutes} min
              </span>
            )}
            {(meta?.capacity ?? 1) > 1 && (
              <span>{meta?.capacity} seats per time</span>
            )}
            <span className="flex min-w-0 items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              <TimezoneSelect value={timezone} onChange={setTimezone} />
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="booking-content">
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          {step.name === "pick" && (
            <div className="flex flex-col gap-6">
              {meta?.selectableHosts && (
                <PublicHostPicker
                  hosts={meta.selectableHosts}
                  selectedRoles={hostRoles}
                  onChange={changeHostRoles}
                />
              )}
              {meta?.inviteeCalendarOverlay && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  <span>
                    {calendarToken
                      ? "Times that work with your Google Calendar are shown first."
                      : "See which times work with your Google Calendar."}
                  </span>
                </div>
                {calendarToken ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={calendarBusy}
                    onClick={async () => {
                      setCalendarBusy(true);
                      await disconnectInviteeCalendar(calendarToken).catch(() => {});
                      sessionStorage.removeItem("calpaca:invitee-calendar");
                      setCalendarToken(null);
                      setCalendarExpiresAt(null);
                      setReloadKey((key) => key + 1);
                      setCalendarBusy(false);
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={calendarBusy}
                    onClick={async () => {
                      setCalendarBusy(true);
                      try {
                        const result = await startInviteeCalendarConnection(
                          `${location.pathname}${location.search}`,
                          workspaceSlug,
                        );
                        location.assign(result.authorizationUrl);
                      } catch (e) {
                        setError(errorMessage(e));
                        setCalendarBusy(false);
                      }
                    }}
                  >
                    Connect Google Calendar
                  </Button>
                )}
                {calendarExpiresAt && (
                  <span className="w-full text-xs text-muted-foreground">
                    Connection expires {new Date(calendarExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
                  </span>
                )}
              </div>}
              {!meta?.selectableHosts || selectedHostIds.length > 0 ? (
                <SlotPicker
                  slug={slug}
                  workspaceSlug={workspaceSlug}
                  timezone={timezone}
                  hosts={meta?.selectableHosts ? selectedHostIds : undefined}
                  optionalHosts={meta?.selectableHosts ? optionalHostIds : undefined}
                  inviteeCalendarToken={calendarToken ?? undefined}
                  reloadKey={reloadKey}
                  onLoadError={(e) => setError(errorMessage(e))}
                  onPick={(slot, missingHostId) => {
                    setError(null);
                    setStep({
                      name: "details",
                      slot,
                      ...(meta?.selectableHosts
                        ? {
                            hosts: selectedHostIds.filter(
                              (id) => id !== missingHostId,
                            ),
                            optionalHosts: optionalHostIds.filter(
                              (id) => id !== missingHostId,
                            ),
                          }
                        : {}),
                    });
                  }}
                />
              ) : (
                <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Choose at least one person to see available times.
                </p>
              )}
              <button
                type="button"
                className="self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setError(null);
                  setStep({ name: "suggest" });
                }}
              >
                None of these work? Suggest a time.
              </button>
            </div>
          )}

          {step.name === "suggest" && (
            <SuggestionStep
              slug={slug}
              workspaceSlug={workspaceSlug}
              timezone={timezone}
              durationMinutes={meta?.durationMinutes ?? 30}
              onBack={() => setStep({ name: "pick" })}
              onSent={(email) => setStep({ name: "suggested", email })}
            />
          )}

          {step.name === "details" && (
            <DetailsStep
              slot={step.slot}
              slug={slug}
              workspaceSlug={workspaceSlug}
              timezone={timezone}
              hosts={step.hosts}
              optionalHosts={step.optionalHosts}
              routingAnswers={routingAnswers}
              meetingFormats={meta?.meetingFormats ?? ["google_meet"]}
              locations={meta?.locations ?? (meta?.meetingFormats ?? ["google_meet"]).map((format) =>
                format === "phone"
                  ? { id: "phone", type: "phone" as const, label: "Phone call", phoneDirection: "organizer_calls_invitee" as const }
                  : { id: "google-meet", type: "google_meet" as const, label: "Google Meet" })}
              bookingQuestions={meta?.bookingQuestions ?? []}
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

/** Who the invitee is meeting: avatars + the team name (members beneath) or
 * the host name(s). Rendered only when the meta response carries a profile. */
function ProfileHeader({ profile }: { profile: EventTypeProfile }) {
  if (!profile.teamName && profile.hosts.length === 0) return null;
  const primary = profile.teamName ?? profile.hosts.map((h) => h.name).join(", ");
  const titles = [...new Set(profile.hosts.flatMap((host) => host.title ? [host.title] : []))];
  return (
    <div className="mb-1 flex items-center gap-3">
      {profile.hosts.length > 0 && (
        <div className="flex shrink-0 -space-x-2">
          {profile.hosts.slice(0, 3).map((h, i) =>
            h.image ? (
              <img
                key={`${h.name}-${i}`}
                src={h.image}
                alt={h.name}
                className="h-9 w-9 rounded-full border-2 border-card object-cover"
              />
            ) : (
              <div
                key={`${h.name}-${i}`}
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-medium"
              >
                {initials(h.name)}
              </div>
            ),
          )}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{primary}</p>
        {profile.teamName && profile.hosts.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {profile.hosts.map((h) => h.name).join(", ")}
          </p>
        )}
        {titles.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {titles.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function PublicHostPicker({
  hosts,
  selectedRoles,
  onChange,
}: {
  hosts: NonNullable<EventTypeMeta["selectableHosts"]>;
  selectedRoles: Record<string, "required" | "optional">;
  onChange: (roles: Record<string, "required" | "optional">) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = hosts.filter((host) => host.id in selectedRoles);
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = hosts.filter(
    (host) =>
      !(host.id in selectedRoles) &&
      normalizedQuery !== "" &&
      host.name.toLowerCase().includes(normalizedQuery),
  );

  return (
    <section className="flex min-w-0 flex-col gap-3 border-b border-border pb-6">
      <div>
        <h2 className="text-sm font-medium">Who should join?</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose people and mark whether their attendance is required.
        </p>
      </div>

      {selected.length > 0 && (
        <ul className="grid min-w-0 gap-2">
          {selected.map((host) => (
            <li
              key={host.id}
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {host.image ? (
                  <img
                    src={host.image}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {initials(host.name)}
                  </span>
                )}
                <span className="min-w-0 truncate text-sm font-medium">{host.name}</span>
              </div>
              <div className="flex items-center gap-1 self-start rounded-md bg-muted p-1 sm:self-auto">
                {(["required", "optional"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selectedRoles[host.id] === role}
                    className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                      selectedRoles[host.id] === role
                        ? "bg-card font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() =>
                      onChange({ ...selectedRoles, [host.id]: role })
                    }
                  >
                    {role}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={`Remove ${host.name}`}
                  className="ml-1 rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                  onClick={() => {
                    const next = { ...selectedRoles };
                    delete next[host.id];
                    onChange(next);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected.length < hosts.length && (
        <div className="relative min-w-0">
          <UserPlus className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search people…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {normalizedQuery !== "" && (
            <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
              {candidates.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No matches.</li>
              )}
              {candidates.map((host) => (
                <li key={host.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onChange({ ...selectedRoles, [host.id]: host.role });
                      setQuery("");
                    }}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                      {initials(host.name)}
                    </span>
                    <span className="truncate">{host.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  return (
    <select
      className="min-w-0 max-w-full bg-transparent text-sm text-muted-foreground focus:outline-none"
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

function BookingQuestionField({
  question,
  value,
  onChange,
}: {
  question: BookingQuestion;
  value: string | string[] | boolean | undefined;
  onChange: (value: string | string[] | boolean) => void;
}) {
  const label = <>{question.label}{question.required ? " *" : ""}</>;
  if (question.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          required={question.required}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }
  if (question.type === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`booking-question-${question.id}`}>{label}</Label>
        <Textarea
          id={`booking-question-${question.id}`}
          required={question.required}
          maxLength={2000}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  if (question.type === "select" || question.type === "multiselect") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`booking-question-${question.id}`}>{label}</Label>
        <select
          id={`booking-question-${question.id}`}
          className="min-h-9 rounded-md border border-border bg-card px-3 py-2 text-sm"
          required={question.required}
          multiple={question.type === "multiselect"}
          value={question.type === "multiselect"
            ? (Array.isArray(value) ? value : [])
            : (typeof value === "string" ? value : "")}
          onChange={(event) => onChange(question.type === "multiselect"
            ? Array.from(event.target.selectedOptions, (option) => option.value)
            : event.target.value)}
        >
          {question.type === "select" && <option value="">Choose…</option>}
          {(question.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`booking-question-${question.id}`}>{label}</Label>
      <Input
        id={`booking-question-${question.id}`}
        type={question.type === "phone" ? "tel" : "text"}
        required={question.required}
        maxLength={2000}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DetailsStep({
  slot,
  slug,
  workspaceSlug,
  timezone,
  hosts,
  optionalHosts,
  routingAnswers,
  meetingFormats,
  locations,
  bookingQuestions,
  onBack,
  onError,
  onConfirmed,
}: {
  slot: SlotDto;
  slug: string;
  workspaceSlug?: string;
  timezone: string;
  hosts?: string[];
  optionalHosts?: string[];
  routingAnswers?: RoutingAnswers;
  meetingFormats: ("phone" | "google_meet")[];
  locations: EventLocation[];
  bookingQuestions: BookingQuestion[];
  onBack: () => void;
  onError: (e: unknown) => void;
  onConfirmed: (confirmation: BookingConfirmation) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingFormat, setMeetingFormat] = useState<"phone" | "google_meet">(
    meetingFormats[0] ?? "google_meet",
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const selectedLocation = locations.find((location) => location.id === locationId) ?? locations[0];
  const [phone, setPhone] = useState("");
  const [bookingAnswers, setBookingAnswers] = useState<BookingAnswers>(() => {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(
      bookingQuestions.filter((question) => question.hidden && params.has(question.id))
        .map((question) => [question.id, params.get(question.id) ?? ""]),
    );
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      // hold-then-confirm: the server re-verifies availability inside the
      // hold transaction, the client never wins a race by itself
      const hold = await createHold({
        eventTypeSlug: slug,
        workspaceSlug,
        start: slot.start.utc,
        end: slot.end.utc,
        hosts,
        optionalHosts,
      });
      const confirmation = await confirmBooking({
        eventTypeSlug: slug,
        workspaceSlug,
        holdIds: hold.holdIds,
        invitee: { email, name, timezone, ...(notes.trim() ? { notes: notes.trim() } : {}) },
        routingAnswers,
        hosts,
        meetingFormat,
        locationId: selectedLocation?.id,
        ...(selectedLocation?.type === "phone" && phone.trim() ? { inviteePhone: phone.trim() } : {}),
        bookingAnswers,
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
        <div className="flex flex-col gap-1.5">
          <Label>Location</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {locations.map((location) => {
              const active = selectedLocation?.id === location.id;
              const Icon = location.type === "phone" ? Phone : location.type === "google_meet" ? Video : Globe;
              return (
                <button
                  key={location.id}
                  type="button"
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                  }`}
                  onClick={() => {
                    setLocationId(location.id);
                    if (location.type === "phone" || location.type === "google_meet") {
                      setMeetingFormat(location.type);
                    }
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span>
                    <span className="block">{location.label}</span>
                    {location.address && <span className="block text-xs text-muted-foreground">{location.address}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedLocation?.instructions && <p className="text-xs text-muted-foreground">{selectedLocation.instructions}</p>}
        </div>
        {selectedLocation?.type === "phone" && (selectedLocation.phoneDirection ?? "organizer_calls_invitee") === "organizer_calls_invitee" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              required
              value={phone}
              placeholder="+1 555 123 4567"
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        )}
        {bookingQuestions.filter((question) => !question.hidden).map((question) => (
          <BookingQuestionField
            key={question.id}
            question={question}
            value={bookingAnswers[question.id]}
            onChange={(value) => setBookingAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        ))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="notes"
            maxLength={2000}
            placeholder="Please share anything that will help prepare for the meeting."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting || !name || !email || !selectedLocation || (
          selectedLocation.type === "phone"
          && (selectedLocation.phoneDirection ?? "organizer_calls_invitee") === "organizer_calls_invitee"
          && !phone.trim()
        )}>
          {submitting ? "Booking…" : "Confirm booking"}
        </Button>
      </form>
    </div>
  );
}

type ProposedWindow = { date: string; time: string };

function SuggestionStep({
  slug,
  workspaceSlug,
  timezone,
  durationMinutes,
  onBack,
  onSent,
}: {
  slug: string;
  workspaceSlug?: string;
  timezone: string;
  durationMinutes: number;
  onBack: () => void;
  onSent: (email: string) => void;
}) {
  const bounds = currentLocalDateTime(timezone);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [windows, setWindows] = useState<ProposedWindow[]>([{ date: "", time: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateWindow(index: number, patch: Partial<ProposedWindow>) {
    setWindows((current) =>
      current.map((window, i) => (i === index ? { ...window, ...patch } : window)),
    );
  }

  async function submit() {
    setError(null);
    let proposedSlots: { start: string; end: string }[];
    try {
      proposedSlots = await Promise.all(windows.map((window) =>
        localSuggestionWindow(window.date, window.time, timezone, durationMinutes),
      ));
      const future = await Promise.all(
        proposedSlots.map((slot) => isFutureInstant(slot.start)),
      );
      if (future.some((valid) => !valid)) {
        setError("Choose times in the future.");
        return;
      }
    } catch {
      setError("Choose valid local dates and times.");
      return;
    }

    setSubmitting(true);
    try {
      await suggestTimes({
        eventTypeSlug: slug,
        workspaceSlug,
        invitee: { name, email, timezone },
        proposedSlots,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      onSent(email);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to available times
      </button>
      <div>
        <h2 className="text-lg font-semibold">Suggest a different time</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share up to three windows in {timezone}. Each window is {durationMinutes} minutes.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suggest-name">Name</Label>
            <Input id="suggest-name" required value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suggest-email">Email</Label>
            <Input id="suggest-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Proposed windows</legend>
          {windows.map((window, index) => (
            <div key={index} className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_auto]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`suggest-date-${index}`}>Date {index + 1}</Label>
                <Input
                  id={`suggest-date-${index}`}
                  type="date"
                  required
                  min={bounds.date}
                  value={window.date}
                  onChange={(event) => updateWindow(index, { date: event.target.value })}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={`suggest-time-${index}`}>Start</Label>
                <Input
                  id={`suggest-time-${index}`}
                  type="time"
                  required
                  min={window.date === bounds.date ? bounds.time : undefined}
                  value={window.time}
                  onChange={(event) => updateWindow(index, { time: event.target.value })}
                />
              </div>
              {windows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0"
                  aria-label={`Remove window ${index + 1}`}
                  onClick={() => setWindows((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {windows.length < 3 && (
            <button
              type="button"
              className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setWindows((current) => [...current, { date: "", time: "" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add another window
            </button>
          )}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="suggest-message">
            Message <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="suggest-message"
            maxLength={1000}
            placeholder="Add any context that might help."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting || !name.trim() || !email.trim()}>
          {submitting ? "Sending…" : "Send suggested times"}
        </Button>
      </form>
    </div>
  );
}

function SuggestionConfirmation({
  email,
  recipient,
  layout,
}: {
  email: string;
  recipient: string;
  layout: "focus" | "split" | "compact";
}) {
  return (
    <div className="booking-shell mx-auto px-4 py-10" data-booking-layout={layout}>
      <Card className="booking-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Check className="h-5 w-5 text-primary" /> Sent
          </CardTitle>
          <CardDescription>
            {recipient} will get back to you at {email}.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function Confirmation({
  slot,
  confirmation,
  timezone,
  layout,
}: {
  slot: SlotDto;
  confirmation: BookingConfirmation;
  timezone: string;
  layout: "focus" | "split" | "compact";
}) {
  return (
    <div className="booking-shell mx-auto px-4 py-10" data-booking-layout={layout}>
      <Card className="booking-card">
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
