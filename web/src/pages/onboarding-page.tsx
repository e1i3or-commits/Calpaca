import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import {
  ApiError,
  checkWorkspaceSlug,
  claimWorkspaceSlug,
  completeOnboarding,
  connectCalendar,
  createEventType,
  createSchedule,
  getMyCalendars,
  getOnboarding,
  getProfile,
  getWorkspace,
  listSchedules,
  recordOnboardingStep,
  updateCalendarConnection,
  updateProfile,
  type CalendarEntry,
  type OnboardingState,
  type OnboardingStepId,
  type WorkspaceSlugCheck,
} from "@/lib/api";
import { bookingBaseUrl, eventTypeBookingUrl } from "@/lib/booking-url";
import {
  starterEventType,
  starterEventTypeSlug,
  starterSchedule,
  STARTER_SCHEDULE_NAME,
} from "../../../src/core/onboarding/starter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";

const STEP_LABELS: Record<OnboardingStepId, string> = {
  profile: "You",
  calendars: "Calendar",
  link: "Your link",
  publish: "First link",
};

const SLUG_REASONS: Record<NonNullable<WorkspaceSlugCheck["reason"]>, string> = {
  empty: "Choose a name for your link.",
  too_short: "Use at least 3 characters.",
  too_long: "Use 40 characters or fewer.",
  invalid_characters: "Use letters, numbers, and hyphens only.",
  reserved: "That word is reserved. Try another.",
  taken: "That link is already taken.",
};

function errorText(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Your session expired. Sign in again.";
    // A 403 is a permission answer, not a stale cookie — telling a member to
    // sign in again just loops them back to the same wall.
    if (cause.status === 403) {
      return cause.code === "account_inactive"
        ? "This account is not active. Ask a workspace owner to re-enable it."
        : "You do not have permission to change that. Ask a workspace owner.";
    }
    if (cause.code === "slug_taken") return "That link was just claimed. Try another.";
    if (cause.code === "no_google_connection") return "Google is not connected to this account.";
    if (cause.code === "google_unreachable") return "Google did not respond. Try again in a moment.";
    return "That did not save. Try again.";
  }
  return "We could not reach Calpaca. Check your connection and try again.";
}

/** The browser's own zone is right far more often than not, and it is the only
 * default that does not make the host hunt through a list of 400 zones. */
function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zoneOptions(current: string): string[] {
  const supported = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  return supported.length > 0
    ? [...new Set([current, ...supported])]
    : [...new Set([current, "UTC"])];
}

export function OnboardingPage() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState<OnboardingStepId | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getOnboarding();
      setState(next);
      // A host who already finished has no business here — send them to the
      // dashboard rather than showing a wizard they completed weeks ago.
      if (!next.required) {
        window.location.replace("/app/home");
        return;
      }
      setStep((current) => current ?? next.resumeStep);
    } catch (cause) {
      // Only an actually-missing session belongs on the sign-in page; bouncing
      // a 403 there sends the host round a loop signing in to no effect.
      if (cause instanceof ApiError && cause.status === 401) {
        window.location.replace("/sign-in");
        return;
      }
      setLoadError(errorText(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = useCallback(async (to: OnboardingStepId) => {
    setStep(to);
    try {
      setState(await recordOnboardingStep(to));
    } catch {
      // Losing the resume marker is survivable: the host is already on the next
      // step, and a reload recomputes the rest from real data.
    }
  }, []);

  if (loadError) {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Setup could not load</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setLoadError(null); void load(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!state || !step) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your setup…
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-2xl">
        <StepRail steps={state.steps} current={step} />
        {step === "profile" && (
          <ProfileStep onDone={() => void advance("calendars")} />
        )}
        {step === "calendars" && (
          <CalendarStep
            onDone={() => void advance("link")}
            onBack={() => setStep("profile")}
          />
        )}
        {step === "link" && (
          <LinkStep
            state={state}
            onDone={(slug) => {
              setState({ ...state, workspace: { ...state.workspace, slug, slugIsPlaceholder: false } });
              void advance("publish");
            }}
            onBack={() => setStep("calendars")}
          />
        )}
        {step === "publish" && (
          <PublishStep onBack={() => setStep("link")} />
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-organizer className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5">
        <BrandMark />
        <span className="text-lg font-semibold tracking-[-0.03em]">Calpaca</span>
      </div>
      <div className="mx-auto grid min-h-[calc(100vh-84px)] max-w-2xl place-items-center py-10">
        {children}
      </div>
    </div>
  );
}

function StepRail({
  steps,
  current,
}: {
  steps: OnboardingState["steps"];
  current: OnboardingStepId;
}) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {steps.map((step, index) => {
        const active = step.id === current;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${
                step.complete
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
              aria-hidden
            >
              {step.complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>
              {STEP_LABELS[step.id]}
            </span>
            {index < steps.length - 1 && (
              <span aria-hidden className="text-muted-foreground/50">/</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState(detectedTimezone());
  const [existing, setExisting] = useState<{ location: string | null; image: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then(({ profile }) => {
      setName(profile.name);
      setTitle(profile.title ?? "");
      // The stored zone is UTC-by-default for a brand-new account, which is a
      // placeholder rather than an answer — prefer what the browser reports.
      setTimezone(profile.timezone === "UTC" ? detectedTimezone() : profile.timezone);
      setExisting({ location: profile.location ?? null, image: profile.image ?? null });
    }).catch(() => setExisting({ location: null, image: null }));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim(),
        title: title.trim() || null,
        location: existing?.location ?? null,
        timezone,
        image: existing?.image ?? null,
      });
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  };

  const zones = useMemo(() => zoneOptions(timezone), [timezone]);

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </span>
        <CardTitle className="text-2xl tracking-[-0.035em]">Confirm who you are</CardTitle>
        <CardDescription>
          Invitees see your name on the booking page. Your timezone decides what
          “9:00” means in your schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        <div className="grid gap-2">
          <Label htmlFor="onboarding-name">Name</Label>
          <Input
            id="onboarding-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="onboarding-title">Title <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="onboarding-title"
            value={title}
            placeholder="Co-CEO, TourScale"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="onboarding-timezone">Timezone</Label>
          <select
            id="onboarding-timezone"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Detected {detectedTimezone()} from your browser.</p>
        </div>
        <Button className="h-11 self-start rounded-xl" disabled={busy || !name.trim()} onClick={() => void submit()}>
          {busy ? "Saving…" : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function CalendarStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [calendars, setCalendars] = useState<CalendarEntry[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      setCalendars((await getMyCalendars()).calendars);
    } catch (cause) {
      setCalendars([]);
      setFailure(errorText(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setBlocking = async (calendar: CalendarEntry, blocking: boolean) => {
    setError(null);
    setPending(calendar.id);
    try {
      let connectionId = calendar.connectionId;
      if (!connectionId) {
        connectionId = (await connectCalendar(calendar.id)).connection.id;
      }
      await updateCalendarConnection(connectionId, { conflictEnabled: blocking });
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(null);
    }
  };

  const setDestination = async (calendar: CalendarEntry) => {
    if (!calendar.connectionId) return;
    setError(null);
    setPending(calendar.id);
    try {
      await updateCalendarConnection(calendar.connectionId, { isWriteDestination: true });
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(null);
    }
  };

  const blockingCount = calendars?.filter((c) => c.connected && c.conflictEnabled).length ?? 0;

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <CardTitle className="text-2xl tracking-[-0.035em]">Protect your calendar</CardTitle>
        <CardDescription>
          Calpaca never offers a time you are already busy — but only for the
          calendars you mark as blocking. Pick those, and where new events go.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        {failure && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="h-4 w-4" /> Calpaca could not read your calendars
            </p>
            <p className="mt-1 text-muted-foreground">{failure}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
              </Button>
              <Button variant="outline" size="sm" onClick={() => { window.location.href = "/sign-in"; }}>
                Use another Google account
              </Button>
              <Button variant="ghost" size="sm" onClick={onDone}>
                Continue without a calendar
              </Button>
            </div>
          </div>
        )}
        {calendars === null && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your Google calendars…
          </p>
        )}
        {calendars !== null && calendars.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {calendars.map((calendar) => (
              <li key={calendar.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{calendar.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {calendar.primary ? "Primary calendar" : calendar.accessRole}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={calendar.connected && calendar.conflictEnabled}
                      disabled={pending === calendar.id}
                      onChange={(event) => void setBlocking(calendar, event.target.checked)}
                    />
                    Blocks time
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="write-destination"
                      className="h-4 w-4"
                      checked={calendar.isWriteDestination}
                      disabled={!calendar.connected || pending === calendar.id}
                      onChange={() => void setDestination(calendar)}
                    />
                    Gets new events
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        {calendars !== null && calendars.length > 0 && blockingCount === 0 && !failure && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Nothing blocks your time yet. Without at least one blocking calendar,
            Calpaca can offer slots on top of meetings you already have.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 rounded-xl" onClick={onDone}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="ghost" className="h-11" onClick={onBack}>Back</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LinkStep({
  state,
  onDone,
  onBack,
}: {
  state: OnboardingState;
  onDone: (slug: string) => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState(
    state.workspace.slugIsPlaceholder ? state.workspace.suggestedSlug ?? "" : state.workspace.slug,
  );
  const [check, setCheck] = useState<WorkspaceSlugCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const candidate = value.trim();
    if (candidate.length === 0) {
      setCheck(null);
      return;
    }
    const ticket = ++latest.current;
    setChecking(true);
    const timer = setTimeout(() => {
      checkWorkspaceSlug(candidate)
        .then((result) => {
          // Ignore a slow answer for a candidate the host has already edited.
          if (ticket === latest.current) setCheck(result);
        })
        .catch(() => undefined)
        .finally(() => {
          if (ticket === latest.current) setChecking(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { workspace } = await claimWorkspaceSlug(value.trim());
      onDone(workspace.slug);
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  };

  // A host who joined an existing workspace has no slug to claim and no
  // permission to change the one that is there. Showing them the claim form
  // walked them into a 403 with no way forward, so show the link instead.
  if (!state.workspace.canManage) {
    return (
      <Card className="w-full rounded-2xl">
        <CardHeader>
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Link2 className="h-5 w-5" />
          </span>
          <CardTitle className="text-2xl tracking-[-0.035em]">Your team's link</CardTitle>
          <CardDescription>
            Your workspace already has its booking address, and every link you
            create lives under it. A workspace owner can change it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>Your link</Label>
            <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
              calpaca.io/book/{state.workspace.slug}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 rounded-xl" onClick={() => onDone(state.workspace.slug)}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="ghost" className="h-11" onClick={onBack}>Back</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Link2 className="h-5 w-5" />
        </span>
        <CardTitle className="text-2xl tracking-[-0.035em]">Claim your link</CardTitle>
        <CardDescription>
          This is the part of every booking URL you will send people. Pick
          something they will recognize — you can change it later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        <div className="grid gap-2">
          <Label htmlFor="onboarding-slug">Your link</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">calpaca.io/book/</span>
            <Input
              id="onboarding-slug"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-describedby="onboarding-slug-status"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <p id="onboarding-slug-status" aria-live="polite" className="min-h-5 text-xs">
            {checking && <span className="text-muted-foreground">Checking…</span>}
            {!checking && check?.available && (
              <span className="text-primary">{check.slug} is available.</span>
            )}
            {!checking && check && !check.available && check.reason && (
              <span className="text-destructive">{SLUG_REASONS[check.reason]}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-11 rounded-xl"
            disabled={busy || checking || !check?.available}
            onClick={() => void submit()}
          >
            {busy ? "Claiming…" : "Claim link"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="ghost" className="h-11" onClick={onBack}>Back</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PublishStep({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<"working" | "ready" | "failed">("working");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const started = useRef(false);

  const build = useCallback(async () => {
    setStatus("working");
    setError(null);
    try {
      const [{ profile }, { workspace, domains, deploymentMode }, { schedules }] = await Promise.all([
        getProfile(),
        getWorkspace(),
        listSchedules(),
      ]);

      // Resuming must not stack up duplicate starters, so an existing schedule
      // with the starter name is reused before creating another.
      const existing = schedules.find((schedule) => schedule.name === STARTER_SCHEDULE_NAME)
        ?? schedules[0];
      const schedule = existing
        ?? await createSchedule(starterSchedule(profile.timezone));

      let slug: string | null = null;
      for (let attempt = 0; attempt < 5 && slug === null; attempt += 1) {
        try {
          const created = await createEventType(
            starterEventType({ userId: profile.id, scheduleId: schedule.id, attempt }),
          );
          slug = created.slug;
        } catch (cause) {
          if (cause instanceof ApiError && cause.code === "slug_taken") {
            // The host already owns this slug — reuse it rather than inventing
            // a second near-identical starter link.
            if (attempt === 0) slug = starterEventTypeSlug(0);
            continue;
          }
          throw cause;
        }
      }
      if (slug === null) throw new Error("could not create a starter event type");

      setUrl(eventTypeBookingUrl(
        bookingBaseUrl({
          workspaceSlug: workspace.slug,
          domains,
          deploymentMode,
          origin: window.location.origin,
        }),
        slug,
      ));
      setStatus("ready");
    } catch (cause) {
      setError(errorText(cause));
      setStatus("failed");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void build();
  }, [build]);

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await completeOnboarding();
      window.location.assign("/app/home");
    } catch (cause) {
      setError(errorText(cause));
      setFinishing(false);
    }
  };

  return (
    <Card className="w-full rounded-2xl">
      <CardHeader>
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <CalendarCheck2 className="h-5 w-5" />
        </span>
        <CardTitle className="text-2xl tracking-[-0.035em]">Your first booking link</CardTitle>
        <CardDescription>
          A 30-minute meeting, weekdays 9:00–17:00 in your timezone, with a
          10-minute gap after each booking and 2 hours' notice required.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        {status === "working" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Creating your schedule and first meeting type…
          </p>
        )}
        {status === "failed" && (
          <Button variant="outline" onClick={() => void build()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        )}
        {status === "ready" && url && (
          <>
            <p className="break-all rounded-lg border border-border bg-muted/40 p-3 text-sm">{url}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted lg:h-9"
              >
                <ExternalLink className="h-4 w-4" /> Preview as an invitee
              </a>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(url)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => setError("Could not copy the link. Select it and copy manually."));
                }}
              >
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-11 rounded-xl"
            disabled={status !== "ready" || finishing}
            onClick={() => void finish()}
          >
            {finishing ? "Finishing…" : "Finish setup"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="ghost" className="h-11" onClick={onBack}>Back</Button>
        </div>
      </CardContent>
    </Card>
  );
}
