import { useCallback, useEffect, useState } from "react";
import { Calendar, CheckCircle2, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  ApiError,
  addTeamMember,
  createEventType,
  createSchedule,
  createTeam,
  deleteEventType,
  deleteSchedule,
  getMyCalendars,
  listEventTypes,
  listSchedules,
  listTeamMembers,
  listTeams,
  listUsers,
  removeTeamMember,
  signOut,
  updateEventType,
  updateSchedule,
  type AdminEventType,
  type CalendarEntry,
  type DirectoryUser,
  type EventTypeInput,
  type Schedule,
  type ScheduleInput,
  type ScheduleRule,
  type Team,
  type TeamMember,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeoplePicker } from "@/components/people-picker";
import { TimezoneSelect } from "@/pages/booking-page";

const TABS = [
  { key: "event-types", label: "Event types" },
  { key: "schedules", label: "Schedules" },
  { key: "team", label: "Team" },
  { key: "calendars", label: "Calendars" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const ERROR_TEXT: Record<string, string> = {
  slug_taken: "That slug is already taken.",
  schedule_in_use: "Event types still use this schedule.",
  event_type_in_use: "This event type has bookings; it can't be deleted.",
  invalid_body: "Some fields are invalid — check the form.",
  team_not_found: "Team not found.",
};

function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? `Error: ${e.code}`;
  return "Could not reach the server.";
}

export function DashboardPage() {
  const [tab, setTab] = useState<TabKey>("event-types");
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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void signOut().then(() => (window.location.href = "/sign-in"));
          }}
        >
          Sign out
        </Button>
      </div>

      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Dashboard sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !users && <p className="text-sm text-muted-foreground">Loading…</p>}
      {users && (
        <>
          {tab === "event-types" && <EventTypesTab users={users} />}
          {tab === "schedules" && <SchedulesTab />}
          {tab === "team" && <TeamTab users={users} />}
          {tab === "calendars" && <CalendarsTab />}
        </>
      )}
    </div>
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
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="flex-1">
                  <span className="font-medium">{et.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    /{et.slug} · {et.durationMinutes} min · {et.mode.replace("_", " ")}
                  </span>
                </span>
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
                        hosts: et.hosts.map(({ userId, role, weight }) => ({ userId, role, weight })),
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
      <div className="grid grid-cols-2 gap-3">
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sched-name">Name</Label>
          <Input
            id="sched-name"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="Working hours"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Timezone</Label>
          <div className="flex h-9 items-center rounded-md border border-border bg-card px-3">
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
            <div key={label} className="flex items-center gap-3 text-sm">
              <label className="flex w-16 items-center gap-2">
                <input type="checkbox" checked={!!rule} onChange={() => toggleDay(dow)} />
                {label}
              </label>
              {rule ? (
                <>
                  <Input
                    type="time"
                    className="w-32"
                    value={rule.start}
                    aria-label={`${label} start`}
                    onChange={(e) => setTime(dow, "start", e.target.value)}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    className="w-32"
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

  useEffect(() => {
    getMyCalendars()
      .then((r) => setCalendars(r.calendars))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Your calendars</CardTitle>
        <CardDescription>Busy times sync from connected calendars.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
