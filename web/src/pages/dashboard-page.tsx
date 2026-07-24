import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Download,
  Home,
  KeyRound,
  ListChecks,
  Link2,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Route,
  ShieldCheck,
  SearchCheck,
  Sun,
  Trash2,
  X,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import {
  ApiError,
  addPollInvitees,
  addTeamMember,
  addWorkspaceDomain,
  analyticsCsvUrl,
  cancelSignupRegistrationByOrganizer,
  connectCalendar,
  createEventType,
  createBookingPage,
  createApiToken,
  createRoutingForm,
  createMeetingPoll,
  createOneOffOffer,
  createSignupSheet,
  createSchedule,
  createTeam,
  deleteEventType,
  deleteBookingPage,
  deleteRoutingForm,
  deleteSchedule,
  disconnectCalendar,
  getMyCalendars,
  getAdminBooking,
  getAnalytics,
  getBookingAssignment,
  getUserManagement,
  getProfile,
  getWorkspace,
  inviteUser,
  listAdminBookings,
  listApiTokens,
  listEventTypes,
  listBookingPages,
  listPresentationOptions,
  listRoutingForms,
  listMeetingPolls,
  listOneOffOffers,
  listSignupSheets,
  listSchedules,
  listTeamMembers,
  listTeams,
  listUsers,
  removeTeamMember,
  removePollInvite,
  revokeUserInvitation,
  revokeApiToken,
  revokeOneOffOffer,
  removeWorkspaceDomain,
  resendPollFinalization,
  resendPollInvitation,
  resendSignupConfirmation,
  markBookingNoShow,
  finalizeMeetingPoll,
  signOut,
  setMeetingPollOpenState,
  suggestMeetingPollTimes,
  troubleshootAvailability,
  updateEventType,
  updateBookingPage,
  updateManagedUser,
  updateCalendarConnection,
  updateProfile,
  updateWorkspace,
  verifyWorkspaceDomain,
  updateRoutingForm,
  updateSchedule,
  updateSignupSheetAdministration,
  updateTeamMemberRole,
  type AdminEventType,
  type BookingPageInput,
  type BookingPageRecord,
  type AdminBooking,
  type AdminBookingDetail,
  type AnalyticsReport,
  type AvailabilityDiagnostic,
  type ApiTokenRecord,
  type AppRole,
  type AssignmentExplanation,
  type CalendarEntry,
  type DirectoryUser,
  type EventTypeInput,
  type PresentationOption,
  type RoutingCondition,
  type RoutingField,
  type RoutingForm,
  type RoutingFormInput,
  type Schedule,
  type ScheduleInput,
  type ScheduleOverride,
  type ScheduleRule,
  type Team,
  type TeamMember,
  type UserManagementDirectory,
  type UserProfile,
  type WorkspaceContext,
  type WorkspaceDomain,
  type MeetingPoll,
  type OneOffOffer,
  type SignupSheet,
} from "@/lib/api";
import { themeOptions } from "@/lib/theme";
import { useAppearance } from "@/lib/appearance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PeoplePicker } from "@/components/people-picker";
import { TimezoneSelect } from "@/pages/booking-page";
import { BrandMark } from "@/components/brand-mark";
import { EngagementsTab } from "@/components/engagements-tab";

const TABS = [
  { key: "home", label: "Home", icon: Home, group: "primary" },
  { key: "event-types", label: "Scheduling", icon: CalendarDays, group: "primary" },
  { key: "bookings", label: "Bookings", icon: CalendarRange, group: "primary" },
  { key: "analytics", label: "Analytics", icon: ChartNoAxesCombined, group: "primary" },
  { key: "polls", label: "Polls", icon: ListChecks, group: "tools" },
  { key: "signup-sheets", label: "Sign-up sheets", icon: CalendarCheck, group: "tools" },
  { key: "routing", label: "Routing", icon: Route, group: "tools" },
  { key: "one-off", label: "One-off offers", icon: Link2, group: "tools" },
  { key: "workspace-general", label: "Workspace general", icon: ShieldCheck, group: "setup" },
  { key: "schedules", label: "Availability", icon: Clock3, group: "setup" },
  { key: "team", label: "People & teams", icon: Users, group: "setup" },
  { key: "calendars", label: "Calendars", icon: Calendar, group: "setup" },
  { key: "api", label: "API access", icon: KeyRound, group: "setup" },
  { key: "troubleshooter", label: "Troubleshooter", icon: SearchCheck, group: "setup" },
  { key: "profile", label: "Account profile", icon: UserRound, group: "account" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
export type DashboardView = TabKey | "engagements";

export const DASHBOARD_VIEW_PATHS: Record<DashboardView, string> = {
  home: "/app/home",
  engagements: "/app/engagements",
  "event-types": "/app/workspace/conversation-playbooks",
  bookings: "/app/meetings",
  polls: "/app/tools/polls",
  "signup-sheets": "/app/tools/signup-sheets",
  analytics: "/app/insights",
  profile: "/app/account/profile",
  "workspace-general": "/app/workspace/general",
  api: "/app/workspace/api",
  schedules: "/app/workspace/availability",
  routing: "/app/tools/routing",
  team: "/app/workspace/people",
  calendars: "/app/workspace/calendars",
  "one-off": "/app/tools?view=one-off-offers",
  troubleshooter: "/app/workspace/availability?view=troubleshooter",
};

const ERROR_TEXT: Record<string, string> = {
  slug_taken: "That slug is already taken.",
  schedule_in_use: "Event types still use this schedule.",
  cannot_forward_to_self: "Choose another person for forwarding.",
  write_destination_required: "Choose another booking destination before disconnecting this calendar.",
  calendar_not_writable: "Google does not allow this account to create events on that calendar.",
  event_type_in_use: "This event type has bookings; it can't be deleted.",
  invalid_body: "Some fields are invalid. Check the form.",
  team_not_found: "Team not found.",
  last_team_admin: "Promote another member before removing or demoting the final team admin.",
  form_not_found: "Routing form not found.",
};

function errorText(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.code] ?? `Error: ${e.code}`;
  return "Could not reach the server.";
}

export function DashboardPage({
  initialView = "home",
  initialMeetingId,
  initialEventTypeEditor,
  initialDiagnostic,
  initialEngagement,
  initialEngagementSection,
  initialPlaybook,
}: {
  initialView?: DashboardView;
  initialMeetingId?: string;
  initialEventTypeEditor?: "new" | string;
  initialEngagement?: "list" | "new" | string;
  initialEngagementSection?: "overview" | "conversations";
  initialPlaybook?: "new" | string;
  initialDiagnostic?: {
    eventTypeId?: string;
    start?: string;
    durationMinutes?: number;
  };
}) {
  const [tab, setTab] = useState<DashboardView>(initialView);
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("calpaca:sidebar-collapsed") === "true",
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const { appearance, toggleAppearance } = useAppearance();

  useEffect(() => setTab(initialView), [initialView]);

  const navigateToView = useCallback((view: DashboardView) => {
    const destination = DASHBOARD_VIEW_PATHS[view];
    if (`${window.location.pathname}${window.location.search}` === destination) {
      setTab(view);
      return;
    }
    window.history.pushState({}, "", destination);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  const navigateToEventTypeEditor = useCallback((eventTypeId: "new" | string) => {
    const destination = eventTypeId === "new"
      ? "/app/workspace/conversation-playbooks/new"
      : `/app/workspace/conversation-playbooks/${encodeURIComponent(eventTypeId)}/edit`;
    window.history.pushState({}, "", destination);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const navigateFromMore = useCallback((view: DashboardView) => {
    setMoreOpen(false);
    navigateToView(view);
  }, [navigateToView]);

  useEffect(() => {
    localStorage.setItem("calpaca:sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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
    <div data-organizer className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-border/70 bg-card/90 px-3 py-5 backdrop-blur transition-[width] md:flex ${sidebarCollapsed ? "w-16" : "w-60"}`}>
        <Brand collapsed={sidebarCollapsed} />
        <nav className="mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Organizer">
          <div className="space-y-1">
            {TABS.filter((item) => item.group === "primary").map((item) => (
              <NavButton key={item.key} item={item} active={tab === item.key} collapsed={sidebarCollapsed} onClick={() => navigateToView(item.key)} />
            ))}
          </div>
          <p className={`mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${sidebarCollapsed ? "sr-only" : ""}`}>
            Tools
          </p>
          <div className="space-y-1">
            {TABS.filter((item) => item.group === "tools").map((item) => (
              <NavButton key={item.key} item={item} active={tab === item.key} collapsed={sidebarCollapsed} onClick={() => navigateToView(item.key)} />
            ))}
          </div>
          <p className={`mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${sidebarCollapsed ? "sr-only" : ""}`}>
            Workspace
          </p>
          <div className="space-y-1">
            {TABS.filter((item) => item.group === "setup").map((item) => (
              <NavButton key={item.key} item={item} active={tab === item.key} collapsed={sidebarCollapsed} onClick={() => navigateToView(item.key)} />
            ))}
          </div>
          <p className={`mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${sidebarCollapsed ? "sr-only" : ""}`}>
            Account
          </p>
          <div className="space-y-1">
            {TABS.filter((item) => item.group === "account").map((item) => (
              <NavButton key={item.key} item={item} active={tab === item.key} collapsed={sidebarCollapsed} onClick={() => navigateToView(item.key)} />
            ))}
          </div>
          <div className="mt-auto border-t border-border/70 pt-3">
            <button
              type="button"
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground lg:h-10 ${sidebarCollapsed ? "justify-center" : ""}`}
              aria-label={`Use ${appearance === "dark" ? "light" : "dark"} mode`}
              title={`Use ${appearance === "dark" ? "light" : "dark"} mode`}
              onClick={toggleAppearance}
            >
              {appearance === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
              {!sidebarCollapsed && (appearance === "dark" ? "Light mode" : "Dark mode")}
            </button>
            <button
              type="button"
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground lg:h-10 ${sidebarCollapsed ? "justify-center" : ""}`}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
              {!sidebarCollapsed && "Collapse sidebar"}
            </button>
            <button
              type="button"
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground lg:h-10 ${sidebarCollapsed ? "justify-center" : ""}`}
              aria-label="Sign out"
              title={sidebarCollapsed ? "Sign out" : undefined}
              onClick={() => void signOut().then(() => (window.location.href = "/sign-in"))}
            >
              <LogOut className="h-4 w-4 shrink-0" /> {!sidebarCollapsed && "Sign out"}
            </button>
            <p className={`px-3 pt-2 text-[10px] text-muted-foreground ${sidebarCollapsed ? "sr-only" : ""}`}>
              Calpaca v{__CALPACA_VERSION__}
            </p>
          </div>
        </nav>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur md:hidden">
        <Brand compact />
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:h-10 lg:w-10"
            aria-label={`Use ${appearance === "dark" ? "light" : "dark"} mode`}
            onClick={toggleAppearance}
          >
            {appearance === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main className={`px-4 pb-24 pt-7 transition-[margin] md:px-8 md:pb-10 md:pt-10 ${sidebarCollapsed ? "md:ml-16" : "md:ml-60"}`}>
        <div className="mx-auto max-w-5xl">
          <PageHeading tab={tab} />
          {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
          {!error && !users && <DashboardSkeleton />}
          {users && (
            <>
              {tab === "home" && <HomeTab onNavigate={navigateToView} />}
              {tab === "engagements" && (
                <EngagementsTab
                  users={users}
                  mode={initialEngagement}
                  section={initialEngagementSection}
                  playbookId={initialPlaybook}
                />
              )}
              {tab === "event-types" && (
                <EventTypesTab
                  users={users}
                  initialEditor={initialEventTypeEditor}
                  onEdit={navigateToEventTypeEditor}
                  onCloseEditor={() => navigateToView("event-types")}
                />
              )}
              {tab === "bookings" && <BookingsTab users={users} initialSelected={initialMeetingId} />}
              {tab === "polls" && <PollsTab />}
              {tab === "signup-sheets" && <SignupSheetsTab />}
              {tab === "analytics" && <AnalyticsTab />}
              {tab === "profile" && <ProfileTab section="profile" />}
              {tab === "workspace-general" && <WorkspaceCard />}
              {tab === "api" && <ProfileTab section="api" />}
              {tab === "schedules" && <SchedulesTab />}
              {tab === "routing" && <RoutingTab users={users} />}
              {tab === "team" && <TeamTab users={users} />}
              {tab === "calendars" && <CalendarsTab />}
              {tab === "one-off" && <OneOffOffersTab />}
              {tab === "troubleshooter" && (
                <AvailabilityTroubleshooterTab initialDiagnostic={initialDiagnostic} />
              )}
            </>
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border/70 bg-card/95 px-1 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden" aria-label="Primary">
        {([
          { key: "home", label: "Home", icon: Home },
          { key: "engagements", label: "Engagements", icon: Users },
          { key: "bookings", label: "Meetings", icon: CalendarRange },
        ] as const).map((item) => {
          const active = item.key === tab && !moreOpen;
          return (
            <button
              key={item.key}
              type="button"
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              aria-current={active ? "page" : undefined}
              onClick={() => navigateToView(item.key)}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium ${
            moreOpen || !["home", "engagements", "bookings"].includes(tab) ? "text-primary" : "text-muted-foreground"
          }`}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
      <MobileMoreSheet
        open={moreOpen}
        returnFocusRef={moreButtonRef}
        activeView={tab}
        onClose={closeMore}
        onNavigate={navigateFromMore}
      />
    </div>
  );
}

const MOBILE_MORE_GROUPS: Array<{
  label: string;
  items: Array<{ view: DashboardView; label: string }>;
}> = [
  { label: "Scheduling", items: [{ view: "event-types", label: "Scheduling" }] },
  { label: "Insights", items: [{ view: "analytics", label: "Analytics" }] },
  {
    label: "Tools",
    items: [
      { view: "polls", label: "Meeting polls" },
      { view: "signup-sheets", label: "Sign-up sheets" },
      { view: "routing", label: "Routing forms" },
      { view: "one-off", label: "One-off offers" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { view: "workspace-general", label: "General" },
      { view: "schedules", label: "Availability" },
      { view: "team", label: "People & teams" },
      { view: "calendars", label: "Calendars" },
      { view: "api", label: "API access" },
      { view: "troubleshooter", label: "Availability troubleshooter" },
    ],
  },
  { label: "Account", items: [{ view: "profile", label: "Profile" }] },
];

function MobileMoreSheet({
  open,
  activeView,
  returnFocusRef,
  onClose,
  onNavigate,
}: {
  open: boolean;
  activeView: DashboardView;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onNavigate: (view: DashboardView) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-more-title"
      className="fixed inset-0 z-40 flex items-end bg-foreground/25 md:hidden"
    >
      <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close navigation" onClick={onClose} />
      <section className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="mobile-more-title" className="text-lg font-semibold">More</h2>
            <p className="text-xs text-muted-foreground">Scheduling tools and workspace settings</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <Button className="mt-5 w-full" onClick={() => onNavigate("event-types")}>
          <Plus className="h-4 w-4" /> Create booking link
        </Button>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {MOBILE_MORE_GROUPS.map((group) => (
            <section key={group.label}>
              <h3 className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</h3>
              <div className="mt-1 grid">
                {group.items.map((item) => (
                  <button
                    key={item.view}
                    type="button"
                    className={`min-h-11 rounded-lg px-3 text-left text-sm ${
                      activeView === item.view ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                    }`}
                    aria-current={activeView === item.view ? "page" : undefined}
                    onClick={() => onNavigate(item.view)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function Brand({
  compact = false,
  collapsed = false,
}: {
  compact?: boolean;
  collapsed?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "" : "px-2"}`}>
      <BrandMark className="h-8 w-8" />
      {!collapsed && <span className="text-[17px] font-semibold tracking-[-0.02em]">Calpaca</span>}
    </div>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: (typeof TABS)[number];
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition lg:h-10 ${collapsed ? "justify-center" : ""} ${
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      onClick={onClick}
    >
      <item.icon className="h-[17px] w-[17px] shrink-0" />
      {!collapsed && item.label}
    </button>
  );
}

const PAGE_COPY: Record<DashboardView, { title: string; description: string }> = {
  home: { title: "Good day", description: "A focused view of what needs your attention." },
  engagements: { title: "Engagements", description: "Client work and the conversations that move it forward." },
  "event-types": { title: "Scheduling", description: "Booking links and the people behind them." },
  bookings: { title: "Bookings", description: "Upcoming conversations and recent history." },
  polls: { title: "Meeting polls", description: "Find the time that works best for a group." },
  "signup-sheets": { title: "Sign-up sheets", description: "Let people enroll in fixed sessions." },
  analytics: { title: "Analytics", description: "A clear view of volume, outcomes, and team balance." },
  profile: { title: "Account profile", description: "Your personal identity on public booking pages." },
  "workspace-general": { title: "Workspace general", description: "Workspace identity, plan, deployment, and booking domains." },
  api: { title: "API access", description: "Personal tokens for trusted integrations and automations." },
  schedules: { title: "Availability", description: "The recurring hours your booking links can offer." },
  routing: { title: "Routing", description: "Send each invitee to the right conversation." },
  team: { title: "People & teams", description: "Hosts, membership, and shared scheduling." },
  calendars: { title: "Calendars", description: "Where Calpaca checks conflicts and writes events." },
  "one-off": { title: "One-off offers", description: "Send a private, single-use choice of exact times." },
  troubleshooter: { title: "Availability troubleshooter", description: "Understand why a specific time can or cannot be booked." },
};

function PageHeading({ tab }: { tab: DashboardView }) {
  const copy = PAGE_COPY[tab];
  return (
    <header className="mb-7">
      <h1 className="text-[28px] font-semibold tracking-[-0.035em] sm:text-[32px]">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
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

function InlineLoading({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {label}
    </p>
  );
}

function ActionableEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{action}</div>
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

function localDateValue(date: Date, timezone = viewerTimezone()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

function localDateTimeValue(utc: string, timezone = viewerTimezone()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc)).map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
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
        <Metric label="No-show rate" value={completed.length ? `${Math.round((noShows / completed.length) * 100)}%` : "Not available"} />
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

function shiftMonth(month: string, delta: number): string {
  const [year, rawMonth] = month.split("-").map(Number);
  const index = year! * 12 + rawMonth! - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function hours(value: number): string {
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  return `${(value / 24).toFixed(1)}d`;
}

function AnalyticsTab() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(() => shiftMonth(currentMonth, -5));
  const [to, setTo] = useState(currentMonth);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    getAnalytics(from, to)
      .then(setReport)
      .catch((cause: unknown) => setError(errorText(cause)));
  }, [from, to]);

  const outcomeTotals = new Map<AnalyticsReport["outcomes"][number]["status"], number>();
  const eventTotals = new Map<string, { confirmed: number; cancelled: number; noShow: number }>();
  for (const row of report?.outcomes ?? []) {
    outcomeTotals.set(row.status, (outcomeTotals.get(row.status) ?? 0) + row.count);
    const current = eventTotals.get(row.eventTypeSlug) ?? { confirmed: 0, cancelled: 0, noShow: 0 };
    if (row.status === "confirmed") current.confirmed += row.count;
    if (row.status === "cancelled") current.cancelled += row.count;
    if (row.status === "no_show") current.noShow += row.count;
    eventTotals.set(row.eventTypeSlug, current);
  }
  const total = [...outcomeTotals.values()].reduce((sum, count) => sum + count, 0);
  const confirmed = outcomeTotals.get("confirmed") ?? 0;
  const cancelled = outcomeTotals.get("cancelled") ?? 0;
  const noShow = outcomeTotals.get("no_show") ?? 0;
  const leadBookings = report?.leadTime.reduce((sum, row) => sum + row.bookingCount, 0) ?? 0;
  const averageLead = leadBookings
    ? (report?.leadTime.reduce((sum, row) => sum + row.averageHours * row.bookingCount, 0) ?? 0) / leadBookings
    : null;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="analytics-from">From</Label>
            <Input id="analytics-from" type="month" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="analytics-to">Through</Label>
            <Input id="analytics-to" type="month" value={to} min={from} max={currentMonth} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        <a
          href={analyticsCsvUrl(from, to)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </section>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {!report && !error && <DashboardSkeleton />}
      {report && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Bookings" value={total} />
            <Metric label="Still confirmed" value={total ? percent(confirmed / total) : "Not available"} />
            <Metric label="Cancelled" value={cancelled} />
            <Metric label="Average lead time" value={averageLead === null ? "Not available" : hours(averageLead)} />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-xl border border-border/70 bg-card p-5">
              <div className="mb-5">
                <h2 className="font-semibold tracking-[-0.02em]">Booking outcomes</h2>
                <p className="mt-1 text-xs text-muted-foreground">Selected months · scheduled meeting date in UTC</p>
              </div>
              {eventTotals.size === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No bookings in this range.</p>
              ) : (
                <div className="space-y-5">
                  {[...eventTotals.entries()].map(([slug, values]) => {
                    const rowTotal = values.confirmed + values.cancelled + values.noShow;
                    return (
                      <div key={slug}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-medium">/{slug}</span>
                          <span className="tabular-nums text-muted-foreground">{rowTotal}</span>
                        </div>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-label={`${slug}: ${values.confirmed} confirmed, ${values.cancelled} cancelled, ${values.noShow} no-shows`}>
                          <span className="bg-primary" style={{ width: `${(values.confirmed / rowTotal) * 100}%` }} />
                          <span className="bg-warning" style={{ width: `${(values.cancelled / rowTotal) * 100}%` }} />
                          <span className="bg-destructive" style={{ width: `${(values.noShow / rowTotal) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />Confirmed {confirmed}</span>
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-warning" />Cancelled {cancelled}</span>
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-destructive" />No-show {noShow}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-5">
              <h2 className="font-semibold tracking-[-0.02em]">No-show health</h2>
              <p className="mt-1 text-xs text-muted-foreground">Lifetime completed meetings</p>
              <div className="mt-5 space-y-4">
                {report.noShowRates.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No completed meetings yet.</p>}
                {report.noShowRates.map((row) => (
                  <div key={row.eventTypeSlug}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">/{row.eventTypeSlug}</span>
                      <span className="font-medium tabular-nums">{percent(row.noShowRate)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{row.noShowCount} of {row.completedCount} meetings</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-card p-5">
              <h2 className="font-semibold tracking-[-0.02em]">Lead time</h2>
              <p className="mt-1 text-xs text-muted-foreground">How far ahead people book</p>
              <div className="mt-4 divide-y divide-border">
                {report.leadTime.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No lead-time data in this range.</p>}
                {report.leadTime.map((row) => (
                  <div key={row.eventTypeSlug} className="flex items-center justify-between py-3 text-sm">
                    <div><p className="font-medium">/{row.eventTypeSlug}</p><p className="text-xs text-muted-foreground">{row.bookingCount} bookings</p></div>
                    <div className="text-right"><p className="font-medium">{hours(row.medianHours)} median</p><p className="text-xs text-muted-foreground">{hours(row.averageHours)} average</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-5">
              <h2 className="font-semibold tracking-[-0.02em]">Round-robin balance</h2>
              <p className="mt-1 text-xs text-muted-foreground">Lifetime booking share compared with configured weight</p>
              <div className="mt-4 divide-y divide-border">
                {report.roundRobin.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No round-robin pools configured.</p>}
                {report.roundRobin.map((row) => (
                  <div key={`${row.eventTypeSlug}-${row.hostEmail}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0"><p className="truncate font-medium">{row.hostName}</p><p className="truncate text-xs text-muted-foreground">/{row.eventTypeSlug}</p></div>
                    <div className="shrink-0 text-right"><p className="font-medium tabular-nums">{percent(row.bookingShare)} actual</p><p className="text-xs text-muted-foreground">{percent(row.weightShare)} target · {row.bookingCount} bookings</p></div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function BookingsTab({
  users,
  initialSelected,
}: {
  users: DirectoryUser[];
  initialSelected?: string;
}) {
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [error, setError] = useState<string | null>(null);
  const timezone = viewerTimezone();

  const reload = useCallback(() => {
    setBookings(null);
    setError(null);
    listAdminBookings({ filter, pageSize: 100, timezone })
      .then((response) => setBookings(response.bookings))
      .catch((cause: unknown) => setError(errorText(cause)));
  }, [filter, timezone]);
  const closeBookingDetails = useCallback(() => {
    if (window.history.state?.calpacaMeetingFromList) {
      if (selected) sessionStorage.setItem("calpaca:return-focus-booking", selected);
      window.history.back();
      return;
    }
    window.history.replaceState(window.history.state, "", "/app/meetings");
    setSelected(null);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [selected]);
  const openBookingDetails = useCallback((bookingId: string) => {
    window.history.pushState(
      { ...window.history.state, calpacaMeetingFromList: true },
      "",
      `/app/meetings/${encodeURIComponent(bookingId)}`,
    );
    setSelected(bookingId);
  }, []);

  useEffect(() => reload(), [reload]);
  useEffect(() => setSelected(initialSelected ?? null), [initialSelected]);
  useEffect(() => {
    const syncSelectedFromLocation = () => {
      const match = window.location.pathname.match(/^\/app\/meetings\/([^/]+)$/);
      if (!match && selected) sessionStorage.setItem("calpaca:return-focus-booking", selected);
      setSelected(match ? decodeURIComponent(match[1]!) : null);
    };
    window.addEventListener("popstate", syncSelectedFromLocation);
    return () => window.removeEventListener("popstate", syncSelectedFromLocation);
  }, [selected]);
  useEffect(() => {
    if (!bookings) return;
    const bookingId = sessionStorage.getItem("calpaca:return-focus-booking");
    if (!bookingId) return;
    const trigger = document.querySelector<HTMLButtonElement>(`button[data-booking-id="${CSS.escape(bookingId)}"]`);
    if (!trigger) return;
    sessionStorage.removeItem("calpaca:return-focus-booking");
    requestAnimationFrame(() => trigger.focus());
  }, [bookings]);

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
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:block">{timezone}</span>
          <Button variant="outline" size="sm" onClick={() => {
            window.location.href = `/api/me/bookings.csv?filter=${filter}&timezone=${encodeURIComponent(timezone)}`;
          }}><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
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
                  data-booking-id={booking.id}
                  className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 border-b border-border/60 px-4 py-4 text-left last:border-0 transition hover:bg-muted/40 sm:grid-cols-[6rem_1fr_auto] sm:px-5"
                  onClick={() => openBookingDetails(booking.id)}
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
          onClose={closeBookingDetails}
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

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
    <div
      ref={dialogRef}
      className="fixed inset-0 z-40 flex justify-end bg-foreground/20 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-details-title"
      tabIndex={-1}
    >
      <button type="button" tabIndex={-1} className="absolute inset-0 cursor-default" aria-label="Close booking details" onClick={onClose} />
      <section className="relative z-10 h-full w-full overflow-y-auto bg-background p-5 shadow-2xl sm:max-w-xl sm:border-l sm:border-border sm:p-7">
        <h2 id="booking-details-title" className="sr-only">Booking details</h2>
        <div className="mb-6 flex items-center justify-between">
          <button ref={closeButtonRef} type="button" className="min-h-11 rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-0" onClick={onClose}>← Back</button>
          {booking && <BookingStatus booking={booking} />}
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
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
              <p className="mt-1 text-sm text-muted-foreground">
                {booking.bookingLocation?.label
                  ?? (booking.meetingFormat === "phone" ? "Phone call" : "Google Meet")}
                {booking.inviteePhone ? ` · ${booking.inviteePhone}` : ""}
              </p>
              {booking.bookingLocation && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {[booking.bookingLocation.address, booking.bookingLocation.url, booking.bookingLocation.phoneNumber, booking.bookingLocation.instructions]
                    .filter(Boolean).join("\n")}
                </p>
              )}
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

            {Object.keys(booking.bookingAnswers ?? {}).length > 0 && (
              <DetailSection title="Booking answers">
                <dl className="space-y-2">
                  {Object.entries(booking.bookingAnswers ?? {}).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[8rem_1fr] gap-3 text-sm">
                      <dt className="text-muted-foreground">
                        {booking.bookingQuestions?.find((question) => question.id === key)?.label ?? key}
                      </dt>
                      <dd>{Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : value}</dd>
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

function CopyFeedbackLabel({
  copied,
  idle,
}: {
  copied: boolean;
  idle: string;
}) {
  return (
    <>
      <span aria-hidden="true" className="grid">
        <span className={`col-start-1 row-start-1 ${copied ? "invisible" : ""}`}>{idle}</span>
        <span className={`col-start-1 row-start-1 ${copied ? "" : "invisible"}`}>Copied</span>
      </span>
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : idle}</span>
    </>
  );
}

function SignupSheetsTab() {
  const [sheets, setSheets] = useState<SignupSheet[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxPerPerson, setMaxPerPerson] = useState(1);
  const [sessions, setSessions] = useState([
    { title: "", description: "", start: "", end: "", capacity: 10 },
  ]);
  const [questions, setQuestions] = useState([{ label: "", required: false }]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const reload = useCallback(() => {
    void listSignupSheets().then((result) => setSheets(result.sheets))
      .catch((cause: unknown) => setError(errorText(cause)));
  }, []);
  useEffect(() => reload(), [reload]);

  const create = async () => {
    setError(null);
    try {
      await createSignupSheet({
        title,
        description: description.trim() || undefined,
        timezone: viewerTimezone(),
        maxRegistrationsPerPerson: maxPerPerson,
        questions: questions.filter((question) => question.label.trim()).map((question, index) => ({
          id: `question-${index + 1}`,
          label: question.label.trim(),
          required: question.required,
        })),
        sessions: sessions.map((session) => ({
          title: session.title,
          description: session.description.trim() || undefined,
          start: new Date(session.start).toISOString(),
          end: new Date(session.end).toISOString(),
          capacity: session.capacity,
        })),
      });
      setCreating(false);
      setTitle("");
      setDescription("");
      setMaxPerPerson(1);
      setSessions([{ title: "", description: "", start: "", end: "", capacity: 10 }]);
      setQuestions([{ label: "", required: false }]);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const updateAdministration = async (
    sheetId: string,
    patch: Parameters<typeof updateSignupSheetAdministration>[1],
  ) => {
    setError(null);
    try {
      await updateSignupSheetAdministration(sheetId, patch);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const cancelRegistration = async (sheetId: string, registrationId: string, name: string) => {
    if (!window.confirm(`Cancel ${name}'s registration? Their seat will be released immediately.`)) return;
    setError(null);
    try {
      await cancelSignupRegistrationByOrganizer(sheetId, registrationId);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const resendConfirmation = async (sheetId: string, registrationId: string) => {
    setError(null);
    try {
      await resendSignupConfirmation(sheetId, registrationId);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setCreating((current) => !current)}>
          <Plus className="h-4 w-4" /> New sign-up sheet
        </Button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {creating && (
        <Card>
          <CardHeader><CardTitle>Create a sign-up sheet</CardTitle><CardDescription>Add fixed sessions people can enroll in.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div><Label htmlFor="sheet-title">Title</Label><Input id="sheet-title" className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
            <div><Label htmlFor="sheet-description">Description</Label><Textarea id="sheet-description" className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <div className="max-w-xs"><Label htmlFor="sheet-limit">Maximum sessions per person</Label><Input id="sheet-limit" className="mt-1" type="number" min={1} max={50} value={maxPerPerson} onChange={(event) => setMaxPerPerson(Number(event.target.value))} /></div>
            <div className="space-y-3">
              <Label>Sessions</Label>
              {sessions.map((session, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                  <Input placeholder="Session name" value={session.title} onChange={(event) => setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} />
                  <Input type="number" min={1} max={500} aria-label="Capacity" value={session.capacity} onChange={(event) => setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, capacity: Number(event.target.value) } : item))} />
                  <Input className="sm:col-span-2" placeholder="Session description (optional)" value={session.description} onChange={(event) => setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
                  <Input type="datetime-local" step={900} aria-label="Starts" value={session.start} onChange={(event) => setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} />
                  <div className="flex gap-2">
                    <Input type="datetime-local" step={900} aria-label="Ends" value={session.end} onChange={(event) => setSessions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} />
                    <Button variant="ghost" disabled={sessions.length === 1} onClick={() => setSessions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setSessions((current) => [...current, { title: "", description: "", start: "", end: "", capacity: 10 }])}><Plus className="h-4 w-4" /> Add session</Button>
            </div>
            <div className="space-y-3">
              <Label>Registration questions</Label>
              {questions.map((question, index) => (
                <div key={index} className="flex gap-2">
                  <Input placeholder="Question (optional)" value={question.label} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={question.required} onChange={(event) => setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} /> Required</label>
                </div>
              ))}
              <Button variant="outline" onClick={() => setQuestions((current) => [...current, { label: "", required: false }])}><Plus className="h-4 w-4" /> Add question</Button>
            </div>
            <Button disabled={!title.trim() || sessions.some((session) => !session.title.trim() || !session.start || !session.end)} onClick={() => void create()}>Create sign-up sheet</Button>
          </CardContent>
        </Card>
      )}
      {sheets === null && <DashboardSkeleton />}
      {sheets?.map((sheet) => (
        <Card key={sheet.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{sheet.title}</CardTitle>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sheet.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {sheet.status === "open" ? "Open" : "Closed"}
                  </span>
                </div>
                <CardDescription>{sheet.sessions.length} session{sheet.sessions.length === 1 ? "" : "s"}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  window.location.href = `/api/me/signup-sheets/${encodeURIComponent(sheet.id)}/registrations.csv`;
                }}><Download className="h-4 w-4" /> Export CSV</Button>
                <Button variant="outline" size="sm" onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/signup/${sheet.publicId}`)
                    .then(() => {
                      setCopied(sheet.id);
                      setTimeout(() => setCopied(null), 1500);
                    })
                    .catch(() => setError("Could not copy the sign-up link. Try again."));
                }}>
                  <Copy className="h-4 w-4" />
                  <CopyFeedbackLabel copied={copied === sheet.id} idle="Copy link" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor={`roster-${sheet.id}`}>Public roster</Label>
                <select
                  id={`roster-${sheet.id}`}
                  className="mt-1 flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm sm:max-w-xs"
                  value={sheet.rosterVisibility}
                  onChange={(event) => void updateAdministration(sheet.id, {
                    rosterVisibility: event.target.value as SignupSheet["rosterVisibility"],
                  })}
                >
                  <option value="hidden">Hide enrollment</option>
                  <option value="counts">Show seat counts</option>
                  <option value="names">Show attendee names</option>
                </select>
              </div>
              <Button
                variant={sheet.status === "open" ? "outline" : "default"}
                onClick={() => void updateAdministration(sheet.id, {
                  status: sheet.status === "open" ? "closed" : "open",
                })}
              >
                {sheet.status === "open" ? "Close enrollment" : "Reopen enrollment"}
              </Button>
            </div>
            {sheet.sessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-medium">{session.title}</p>
                    <p className="text-sm text-muted-foreground">{formatBookingDate(session.start)} · {formatBookingTime(session.start)}</p>
                    {session.overCapacity && (
                      <p className="mt-1 text-xs font-medium text-destructive">
                        Over capacity by {session.registrationCount - session.capacity}; existing registrations are preserved.
                      </p>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <div>
                      <Label htmlFor={`capacity-${session.id}`} className="text-xs">Capacity</Label>
                      <Input
                        id={`capacity-${session.id}`}
                        className="mt-1 w-20"
                        type="number"
                        min={1}
                        max={500}
                        defaultValue={session.capacity}
                        onBlur={(event) => {
                          const capacity = Number(event.target.value);
                          if (capacity !== session.capacity && capacity >= 1 && capacity <= 500) {
                            void updateAdministration(sheet.id, {
                              capacities: [{ sessionId: session.id, capacity }],
                            });
                          }
                        }}
                      />
                    </div>
                    <span className="pb-2 text-sm">{session.registrationCount}/{session.capacity} registered</span>
                  </div>
                </div>
                {session.registrations && session.registrations.length > 0 && (
                  <div className="mt-3 divide-y divide-border border-t border-border pt-2 text-sm">
                    {session.registrations.map((registration) => (
                      <div key={registration.id} className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-start ${registration.status === "cancelled" ? "opacity-55" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p>
                            {registration.name} <span className="text-muted-foreground">{registration.email}</span>
                            {registration.status === "cancelled" && <span className="ml-2 text-xs">Cancelled</span>}
                          </p>
                          <p className={`text-xs ${registration.confirmationError ? "text-destructive" : "text-muted-foreground"}`}>
                            Confirmation: {registration.confirmationError
                              ? "failed"
                              : registration.confirmationSentAt ? "sent" : "pending"}
                          </p>
                          {Object.entries(registration.answers).map(([questionId, answer]) => (
                            <p key={questionId} className="text-xs text-muted-foreground">
                              {sheet.questions.find((question) => question.id === questionId)?.label ?? questionId}: {answer}
                            </p>
                          ))}
                        </div>
                        {registration.status === "active" && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => void resendConfirmation(sheet.id, registration.id)}>
                              Resend
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void cancelRegistration(sheet.id, registration.id, registration.name)}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function localInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const DIAGNOSTIC_COPY: Record<AvailabilityDiagnostic["hosts"][number]["reason"], string> = {
  available: "Available",
  schedule_missing: "No availability schedule is connected",
  outside_working_hours: "Outside recurring working hours",
  time_off: "Blocked by a date override or time off",
  calendar_conflict: "Conflicts with a busy calendar event or booking",
  minimum_notice: "Inside the minimum-notice window",
  rolling_window: "Outside the booking window",
  buffer_outside_hours: "Required buffer extends outside working hours",
  forwarded_available: "Available through configured teammate coverage",
};

function diagnosticStartValue(start: string | undefined): string {
  if (!start) return localInputValue(new Date(Date.now() + 86_400_000));
  const parsed = new Date(start);
  return Number.isNaN(parsed.getTime())
    ? localInputValue(new Date(Date.now() + 86_400_000))
    : localInputValue(parsed);
}

function AvailabilityTroubleshooterTab({
  initialDiagnostic,
}: {
  initialDiagnostic?: {
    eventTypeId?: string;
    start?: string;
    durationMinutes?: number;
  };
}) {
  const [eventTypes, setEventTypes] = useState<AdminEventType[]>([]);
  const [eventTypeId, setEventTypeId] = useState(initialDiagnostic?.eventTypeId ?? "");
  const [duration, setDuration] = useState(initialDiagnostic?.durationMinutes ?? 30);
  const [start, setStart] = useState(diagnosticStartValue(initialDiagnostic?.start));
  const [result, setResult] = useState<AvailabilityDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEventTypes().then(({ eventTypes: items }) => {
      setEventTypes(items);
      const requested = initialDiagnostic?.eventTypeId
        ? items.find((item) => item.id === initialDiagnostic.eventTypeId)
        : undefined;
      if (initialDiagnostic?.eventTypeId && !requested) {
        setEventTypeId("");
        setError("That event type is no longer available. Choose another event type.");
        return;
      }
      const preferred = requested ?? items[0];
      if (preferred) {
        setEventTypeId(preferred.id);
        if (!initialDiagnostic?.durationMinutes) setDuration(preferred.durationMinutes);
      }
    }).catch((e) => setError(errorText(e)));
  }, [initialDiagnostic?.durationMinutes, initialDiagnostic?.eventTypeId]);

  const selected = eventTypes.find((eventType) => eventType.id === eventTypeId);
  const inspect = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await troubleshootAvailability({
        eventTypeId,
        start: new Date(start).toISOString(),
        durationMinutes: duration,
      }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Inspect a time</CardTitle>
          <CardDescription>Calendar details stay private; only the blocking category is shown.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="diagnostic-event">Event type</Label>
            <select
              id="diagnostic-event"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={eventTypeId}
              onChange={(event) => {
                setEventTypeId(event.target.value);
                const next = eventTypes.find((item) => item.id === event.target.value);
                if (next) setDuration(next.durationMinutes);
                setResult(null);
              }}
            >
              {!eventTypeId && <option value="">Choose an event type</option>}
              {eventTypes.map((eventType) => <option key={eventType.id} value={eventType.id}>{eventType.title}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diagnostic-start">Proposed start</Label>
            <Input id="diagnostic-start" type="datetime-local" step={900} value={start} onChange={(event) => setStart(event.target.value)} />
            <p className="text-xs text-muted-foreground">Interpreted in your current device timezone.</p>
          </div>
          <div>
            <Label>Duration</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(selected?.selectableDurations?.length ? selected.selectableDurations : [selected?.durationMinutes ?? 30]).map((minutes) => (
                <Button key={minutes} type="button" size="sm" variant={duration === minutes ? "default" : "outline"} onClick={() => setDuration(minutes)}>
                  {minutes} min
                </Button>
              ))}
            </div>
          </div>
          <Button disabled={loading || !eventTypeId || !start} onClick={() => void inspect()}>
            <SearchCheck className="h-4 w-4" /> {loading ? "Checking…" : "Check availability"}
          </Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{result ? (result.available ? "This time can be booked" : "This time cannot be booked") : "Diagnostic result"}</CardTitle>
          <CardDescription>
            {result
              ? `${new Date(result.start).toLocaleString()}–${new Date(result.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Choose an event type and time to inspect every configured host."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result && (
            <div className="space-y-3">
              {result.hosts.map((host) => (
                <div key={host.userId} className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                  <div>
                    <p className="font-medium">{host.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{DIAGNOSTIC_COPY[host.reason]}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${host.available ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {host.available ? "Available" : "Blocked"}
                  </span>
                </div>
              ))}
              {result.hosts.length === 0 && <p className="text-sm text-muted-foreground">This event type has no configured hosts.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OneOffOffersTab() {
  const [offers, setOffers] = useState<OneOffOffer[]>([]);
  const [eventTypes, setEventTypes] = useState<AdminEventType[]>([]);
  const [creating, setCreating] = useState(false);
  const [eventTypeId, setEventTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [duration, setDuration] = useState(30);
  const [starts, setStarts] = useState([localInputValue(new Date(Date.now() + 86_400_000))]);
  const [expiresAt, setExpiresAt] = useState(localInputValue(new Date(Date.now() + 7 * 86_400_000)));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(() => {
    listOneOffOffers().then((result) => setOffers(result.offers)).catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    reload();
    listEventTypes().then(({ eventTypes: items }) => {
      setEventTypes(items);
      if (items[0]) {
        setEventTypeId(items[0].id);
        setDuration(items[0].durationMinutes);
      }
    }).catch((e) => setError(errorText(e)));
  }, [reload]);

  const selectEventType = (id: string) => {
    setEventTypeId(id);
    const eventType = eventTypes.find((item) => item.id === id);
    if (eventType) setDuration(eventType.durationMinutes);
  };

  const save = async () => {
    setError(null);
    try {
      await createOneOffOffer({
        eventTypeId,
        title,
        message: message.trim() || null,
        recipientEmail: recipientEmail.trim() || null,
        slots: starts.map((start) => {
          const begins = new Date(start);
          return {
            start: begins.toISOString(),
            end: new Date(begins.getTime() + duration * 60_000).toISOString(),
          };
        }),
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setCreating(false);
      setTitle("");
      setMessage("");
      setRecipientEmail("");
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setCreating((value) => !value)}>
          <Plus className="h-4 w-4" /> New offer
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create a single-use offer</CardTitle>
            <CardDescription>The first completed booking uses the link. Every other attempt is blocked.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="offer-event">Event type</Label>
              <select id="offer-event" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={eventTypeId} onChange={(event) => selectEventType(event.target.value)}>
                {eventTypes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-title">Offer title</Label>
              <Input id="offer-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A time reserved for you" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-message">Message (optional)</Label>
              <Textarea id="offer-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Choose whichever time works best." />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-recipient">Restrict to email (optional)</Label>
              <Input id="offer-recipient" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="person@example.com" />
            </div>
            <div>
              <Label>Meeting duration</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(eventTypes.find((item) => item.id === eventTypeId)?.selectableDurations ?? [eventTypes.find((item) => item.id === eventTypeId)?.durationMinutes ?? 30]).map((minutes) => (
                  <Button key={minutes} type="button" size="sm" variant={duration === minutes ? "default" : "outline"} onClick={() => setDuration(minutes)}>
                    {minutes} min
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              <Label>Times</Label>
              {starts.map((start, index) => (
                <div key={index} className="flex gap-2">
                  <Input type="datetime-local" step={900} value={start} onChange={(event) => setStarts((items) => items.map((item, i) => i === index ? event.target.value : item))} />
                  {starts.length > 1 && <Button type="button" size="sm" className="h-11 w-11 px-0 lg:h-10 lg:w-10" variant="ghost" aria-label="Remove time" onClick={() => setStarts((items) => items.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => setStarts((items) => [...items, localInputValue(new Date(Date.now() + (items.length + 1) * 86_400_000))])}>
                <Plus className="h-4 w-4" /> Add time
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-expiry">Link expires</Label>
              <Input id="offer-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button disabled={!eventTypeId || !title.trim() || starts.some((start) => !start)} onClick={() => void save()}>Create offer</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {offers.map((offer) => (
        <Card key={offer.id}>
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{offer.title}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{offer.status}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{offer.eventTypeTitle} · {offer.slots.length} {offer.slots.length === 1 ? "time" : "times"}</p>
              <p className="text-xs text-muted-foreground">Expires {new Date(offer.expiresAt).toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                const url = `${window.location.origin}/offer/${offer.publicId}`;
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(offer.id);
                  setTimeout(() => setCopied(null), 1500);
                }).catch(() => setError("Could not copy the offer link. Try again."));
              }}>
                <Copy className="h-4 w-4" />
                <CopyFeedbackLabel copied={copied === offer.id} idle="Copy link" />
              </Button>
              {offer.status === "active" && <Button variant="ghost" size="sm" onClick={() => void revokeOneOffOffer(offer.id).then(reload).catch((e) => setError(errorText(e)))}>Revoke</Button>}
            </div>
          </CardContent>
        </Card>
      ))}
      {!creating && offers.length === 0 && (
        <ActionableEmptyState
          title="No single-use offers yet"
          description="Reserve a private set of times for one recipient. The link stops working after the first booking."
          action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create an offer</Button>}
        />
      )}
    </div>
  );
}

function PollsTab() {
  const timezone = viewerTimezone();
  const today = localDateValue(new Date(), timezone);
  const nextWeek = localDateValue(new Date(Date.now() + 7 * 24 * 60 * 60_000), timezone);
  const [polls, setPolls] = useState<MeetingPoll[] | null>(null);
  const [expandedPolls, setExpandedPolls] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [options, setOptions] = useState([{ start: "" }, { start: "" }]);
  const [windowStartDate, setWindowStartDate] = useState(today);
  const [windowEndDate, setWindowEndDate] = useState(nextWeek);
  const [dailyStart, setDailyStart] = useState("09:00");
  const [dailyEnd, setDailyEnd] = useState("17:00");
  const [suggestionCount, setSuggestionCount] = useState(10);
  const [suggesting, setSuggesting] = useState(false);
  const [resultsVisibility, setResultsVisibility] = useState<"live" | "after_response" | "aggregates" | "hidden">("after_response");
  const [deadline, setDeadline] = useState("");
  const [allowResponseEditing, setAllowResponseEditing] = useState(true);
  const [participantLimit, setParticipantLimit] = useState("");
  const [inviteeEmails, setInviteeEmails] = useState("");
  const [reminder24Hours, setReminder24Hours] = useState(false);
  const [reminder1Hour, setReminder1Hour] = useState(false);
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(() => {
    setPolls(null);
    void listMeetingPolls().then((result) => setPolls(result.polls))
      .catch((cause: unknown) => setError(errorText(cause)));
  }, []);
  useEffect(() => reload(), [reload]);
  useEffect(() => {
    const refresh = window.setInterval(() => {
      void listMeetingPolls().then((result) => setPolls(result.polls), () => {});
    }, 10_000);
    return () => window.clearInterval(refresh);
  }, []);

  const create = async () => {
    setError(null);
    try {
      await createMeetingPoll({
        title,
        description: description.trim() || undefined,
        timezone: viewerTimezone(),
        resultsVisibility,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        allowResponseEditing,
        participantLimit: participantLimit ? Number(participantLimit) : undefined,
        reminder24Hours,
        reminder1Hour,
        inviteeEmails: [...new Set(inviteeEmails
          .split(/[\s,;]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean))],
        options: options.map((option) => ({
          start: new Date(option.start).toISOString(),
          end: new Date(new Date(option.start).getTime() + durationMinutes * 60_000).toISOString(),
        })),
      });
      setCreating(false);
      setTitle("");
      setDescription("");
      setDurationMinutes(30);
      setOptions([{ start: "" }, { start: "" }]);
      setResultsVisibility("after_response");
      setDeadline("");
      setAllowResponseEditing(true);
      setParticipantLimit("");
      setInviteeEmails("");
      setReminder24Hours(false);
      setReminder1Hour(false);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const suggest = async () => {
    setError(null);
    setSuggesting(true);
    try {
      const result = await suggestMeetingPollTimes({
        timezone,
        startDate: windowStartDate,
        endDate: windowEndDate,
        dailyStart,
        dailyEnd,
        durationMinutes,
        count: suggestionCount,
      });
      if (result.suggestions.length < 2) {
        setError("Not enough open times were found in that window. Try a wider date or time range.");
        return;
      }
      setOptions(result.suggestions.map((option) => ({
        start: localDateTimeValue(option.start, timezone),
      })));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSuggesting(false);
    }
  };

  const finalize = async (poll: MeetingPoll, optionId: string) => {
    if (!window.confirm("Finalize this time? Voting will close.")) return;
    try {
      await finalizeMeetingPoll(poll.id, optionId);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const changeOpenState = async (poll: MeetingPoll, open: boolean) => {
    try {
      await setMeetingPollOpenState(poll.id, open);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const resendFinalization = async (pollId: string, participantId: string) => {
    try {
      await resendPollFinalization(pollId, participantId);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const addInvitees = async (pollId: string) => {
    const emails = [...new Set((inviteDrafts[pollId] ?? "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean))];
    if (emails.length === 0) return;
    try {
      await addPollInvitees(pollId, emails);
      setInviteDrafts((current) => ({ ...current, [pollId]: "" }));
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const removeInvite = async (
    pollId: string,
    inviteId: string,
    responded: boolean,
  ) => {
    const message = responded
      ? "Remove this invitation? Their submitted response will remain in the poll."
      : "Remove this invitation? They will no longer receive reminders.";
    if (!window.confirm(message)) return;
    try {
      await removePollInvite(pollId, inviteId);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const resendInvitation = async (pollId: string, inviteId: string) => {
    try {
      await resendPollInvitation(pollId, inviteId);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setCreating((value) => !value)}>
          <Plus className="h-4 w-4" /> New poll
        </Button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
      {creating && (
        <Card className="rounded-xl">
          <CardHeader><CardTitle>Create a meeting poll</CardTitle><CardDescription>Add two or more candidate times.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div><Label htmlFor="poll-title">Title</Label><Input id="poll-title" className="mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
            <div><Label htmlFor="poll-description">Description</Label><Textarea id="poll-description" className="mt-1.5" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <div>
              <Label>Meeting duration</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[15, 30, 45, 60, 90, 120].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      durationMinutes === minutes
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setDurationMinutes(minutes)}
                  >
                    {minutes < 60 ? `${minutes} min` : minutes === 60 ? "1 hour" : `${minutes / 60} hours`}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="poll-results-visibility">Results visibility</Label>
                <select id="poll-results-visibility" className="mt-1 block h-9 w-full rounded-md border border-border bg-card px-3 text-sm" value={resultsVisibility} onChange={(event) => setResultsVisibility(event.target.value as typeof resultsVisibility)}>
                  <option value="after_response">After responding</option>
                  <option value="live">Live for everyone</option>
                  <option value="aggregates">Aggregate totals only</option>
                  <option value="hidden">Hidden until finalized</option>
                </select>
              </div>
              <div>
                <Label htmlFor="poll-deadline">Voting deadline (optional)</Label>
                <Input
                  id="poll-deadline"
                  type="datetime-local"
                  step={900}
                  className="mt-1"
                  value={deadline}
                  onChange={(event) => {
                    setDeadline(event.target.value);
                    if (!event.target.value) {
                      setReminder24Hours(false);
                      setReminder1Hour(false);
                    }
                  }}
                />
              </div>
              <div>
                <Label htmlFor="poll-participant-limit">Participant limit (optional)</Label>
                <Input id="poll-participant-limit" type="number" min={1} max={500} className="mt-1" placeholder="No limit" value={participantLimit} onChange={(event) => setParticipantLimit(event.target.value)} />
              </div>
              <label className="flex items-center gap-2 self-end rounded-lg border border-border px-3 py-2 text-sm">
                <input type="checkbox" checked={allowResponseEditing} onChange={(event) => setAllowResponseEditing(event.target.checked)} />
                Allow people to edit responses
              </label>
              <div className="sm:col-span-2">
                <Label htmlFor="poll-invitees">Invite people (optional)</Label>
                <Textarea id="poll-invitees" className="mt-1" placeholder="alex@example.com, sam@example.com" value={inviteeEmails} onChange={(event) => setInviteeEmails(event.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Separate addresses with commas, spaces, or new lines.</p>
              </div>
              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <label className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm ${!deadline ? "opacity-50" : ""}`}>
                  <input type="checkbox" disabled={!deadline} checked={reminder24Hours} onChange={(event) => setReminder24Hours(event.target.checked)} />
                  Remind unanswered invitees 24 hours before
                </label>
                <label className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm ${!deadline ? "opacity-50" : ""}`}>
                  <input type="checkbox" disabled={!deadline} checked={reminder1Hour} onChange={(event) => setReminder1Hour(event.target.checked)} />
                  Remind unanswered invitees 1 hour before
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium">Suggest times from my calendar</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We’ll use your working hours and avoid conflicts across connected calendars.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="poll-window-start">From</Label><Input id="poll-window-start" type="date" min={today} className="mt-1" value={windowStartDate} onChange={(event) => setWindowStartDate(event.target.value)} /></div>
                <div><Label htmlFor="poll-window-end">Through</Label><Input id="poll-window-end" type="date" min={windowStartDate} className="mt-1" value={windowEndDate} onChange={(event) => setWindowEndDate(event.target.value)} /></div>
                <div><Label htmlFor="poll-daily-start">Earliest start</Label><Input id="poll-daily-start" type="time" step={900} className="mt-1" value={dailyStart} onChange={(event) => setDailyStart(event.target.value)} /></div>
                <div><Label htmlFor="poll-daily-end">Latest end</Label><Input id="poll-daily-end" type="time" step={900} className="mt-1" value={dailyEnd} onChange={(event) => setDailyEnd(event.target.value)} /></div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="poll-suggestion-count">Number of options</Label>
                  <select id="poll-suggestion-count" className="mt-1 block h-9 rounded-md border border-border bg-card px-3 text-sm" value={suggestionCount} onChange={(event) => setSuggestionCount(Number(event.target.value))}>
                    {[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </div>
                <Button type="button" onClick={() => void suggest()} disabled={suggesting || !windowStartDate || !windowEndDate || !dailyStart || !dailyEnd}>
                  <CalendarRange className="h-4 w-4" /> {suggesting ? "Finding times…" : "Suggest open times"}
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={index} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <Label htmlFor={`poll-option-${index}`}>Option {index + 1}</Label>
                    <Input id={`poll-option-${index}`} type="datetime-local" step={900} className="mt-1" value={option.start} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? { start: event.target.value } : item))} />
                  </div>
                  <Button type="button" variant="ghost" className="self-end px-3" disabled={options.length <= 2} onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setOptions((current) => [...current, { start: "" }])}><Plus className="h-4 w-4" /> Add another time</Button>
              <Button disabled={!title.trim() || options.some((option) => !option.start)} onClick={() => void create()}>Create poll</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {polls === null && <DashboardSkeleton />}
      {polls?.length === 0 && !creating && (
        <ActionableEmptyState
          title="No meeting polls yet"
          description="Collect availability from a group when a booking link cannot settle the time."
          action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create a poll</Button>}
        />
      )}
      {polls?.map((poll) => (
        <Card key={poll.id} className="rounded-xl">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{poll.title}</CardTitle>
                <CardDescription>
                  {poll.participantCount} response{poll.participantCount === 1 ? "" : "s"} · {poll.status}
                  {poll.deadline ? ` · closes ${formatBookingDate(poll.deadline)} ${formatBookingTime(poll.deadline)}` : ""}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {poll.status !== "finalized" && !(poll.deadline && new Date(poll.deadline).getTime() <= Date.now()) && (
                  <Button variant="outline" size="sm" onClick={() => void changeOpenState(poll, !poll.votingOpen)}>
                    {poll.votingOpen ? "Close voting" : "Reopen"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/poll/${poll.publicId}`)
                    .then(() => {
                      setCopied(poll.id);
                      setTimeout(() => setCopied(null), 1500);
                    })
                    .catch(() => setError("Could not copy the poll link. Try again."));
                }}>
                  <Copy className="h-4 w-4" />
                  <CopyFeedbackLabel copied={copied === poll.id} idle="Copy link" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={expandedPolls.has(poll.id)}
                  onClick={() => setExpandedPolls((current) => {
                    const next = new Set(current);
                    if (next.has(poll.id)) next.delete(poll.id);
                    else next.add(poll.id);
                    return next;
                  })}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedPolls.has(poll.id) ? "rotate-180" : ""}`} />
                  {expandedPolls.has(poll.id) ? "Collapse" : "Expand"}
                </Button>
              </div>
            </div>
          </CardHeader>
          {expandedPolls.has(poll.id) && <CardContent className="space-y-2">
            {poll.options.map((option) => (
              <div key={option.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${poll.finalizedOptionId === option.id ? "border-primary bg-primary/5" : "border-border"}`}>
                <div>
                  <p className="text-sm font-medium">{formatBookingDate(option.start, { weekday: "short", month: "short", day: "numeric" })} · {formatBookingTime(option.start)}</p>
                  <p className="text-xs text-muted-foreground">{option.yes} yes · {option.ifNeeded} if needed · {option.no} no</p>
                </div>
                {poll.votingOpen && <Button size="sm" variant={option.rank === 1 ? "default" : "outline"} onClick={() => void finalize(poll, option.id)}>Finalize</Button>}
                {poll.responses && poll.responses.length > 0 && (
                  <details className="basis-full border-t border-border pt-3 sm:hidden">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Participant details</summary>
                    <ul className="mt-2 divide-y divide-border">
                      {poll.responses.map((response) => {
                        const choice = response.votes.find((vote) => vote.optionId === option.id)?.choice ?? "no";
                        return (
                          <li key={response.email} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <span className="min-w-0 truncate">{response.name}</span>
                            <span className="capitalize text-muted-foreground">{choice.replace("_", " ")}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </div>
            ))}
            {poll.responses && poll.responses.length > 0 && (
              <div className="mt-4 hidden overflow-x-auto border-t border-border pt-4 sm:block">
                <table className="w-full min-w-[36rem] text-left text-xs">
                  <thead><tr><th className="pb-2 pr-4 font-medium">Participant</th>{poll.options.map((option) => <th key={option.id} className="px-2 pb-2 text-center font-medium">#{option.rank}</th>)}{poll.status === "finalized" && <th className="pb-2 pl-2 text-right font-medium">Delivery</th>}</tr></thead>
                  <tbody>
                    {poll.responses.map((response) => (
                      <tr key={response.email} className="border-t border-border">
                        <td className="py-2 pr-4">
                          <span className="font-medium">{response.name}</span>
                          <span className="ml-2 text-muted-foreground">{response.email}</span>
                          {poll.status === "finalized" && (
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              response.finalizationStatus === "sent"
                                ? "bg-emerald-500/15 text-emerald-700"
                                : response.finalizationStatus === "failed"
                                  ? "bg-red-500/15 text-red-700"
                                  : "bg-amber-400/20 text-amber-700"
                            }`}>
                              {response.finalizationStatus ?? "pending"}
                            </span>
                          )}
                        </td>
                        {poll.options.map((option) => {
                          const choice = response.votes.find((vote) => vote.optionId === option.id)?.choice ?? "no";
                          return <td key={option.id} className="px-2 py-2 text-center capitalize">{choice.replace("_", " ")}</td>;
                        })}
                        {poll.status === "finalized" && response.id && (
                          <td className="py-2 pl-2 text-right">
                            <Button size="sm" variant="ghost" disabled={response.finalizationStatus === "pending"} onClick={() => void resendFinalization(poll.id, response.id!)}>
                              Resend
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invitations</p>
              {poll.invites && poll.invites.length > 0 && (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {poll.invites.map((invite) => {
                    const status = invite.responded
                      ? "Responded"
                      : invite.lastError
                        ? "Delivery failed"
                        : invite.invitationSentAt
                          ? "Invited"
                          : "Pending";
                    const reminders = [
                      invite.reminder24SentAt ? "24-hour reminder sent" : null,
                      invite.reminder1SentAt ? "1-hour reminder sent" : null,
                    ].filter(Boolean).join(" · ");
                    return (
                      <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{invite.email}</p>
                          <p className={`text-xs ${
                            invite.responded
                              ? "text-emerald-700"
                              : invite.lastError
                                ? "text-red-700"
                                : "text-muted-foreground"
                          }`}>
                            {status}{reminders ? ` · ${reminders}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {!invite.responded && poll.votingOpen && (
                            <Button size="sm" variant="ghost" onClick={() => void resendInvitation(poll.id, invite.id)}>
                              Resend
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${invite.email}`}
                            onClick={() => void removeInvite(poll.id, invite.id, invite.responded)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {poll.votingOpen && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label={`Add invitees to ${poll.title}`}
                    placeholder="alex@example.com, sam@example.com"
                    value={inviteDrafts[poll.id] ?? ""}
                    onChange={(event) => setInviteDrafts((current) => ({
                      ...current,
                      [poll.id]: event.target.value,
                    }))}
                  />
                  <Button
                    variant="outline"
                    disabled={!(inviteDrafts[poll.id] ?? "").trim()}
                    onClick={() => void addInvitees(poll.id)}
                  >
                    <UserPlus className="h-4 w-4" /> Add
                  </Button>
                </div>
              )}
            </div>
          </CardContent>}
        </Card>
      ))}
    </div>
  );
}

// ---- event types ----

const DEFAULT_EVENT_TYPE: EventTypeInput = {
  slug: "",
  title: "",
  description: null,
  durationMinutes: 30,
  selectableDurations: [30],
  capacity: 1,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minimumNoticeMin: 240,
  rollingWindowDays: 14,
  mode: "solo",
  scheduleId: null,
  teamId: null,
  theme: "default",
  layout: "focus",
  logoUrl: null,
  meetingFormats: ["google_meet"],
  locations: [{ id: "google-meet", type: "google_meet", label: "Google Meet" }],
  bookingQuestions: [],
  emailVerificationRequired: false,
  hosts: [],
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function eventTypeToInput(eventType: AdminEventType): EventTypeInput {
  return {
    slug: eventType.slug,
    title: eventType.title,
    description: eventType.description ?? null,
    durationMinutes: eventType.durationMinutes,
    selectableDurations: eventType.selectableDurations?.length
      ? eventType.selectableDurations
      : [eventType.durationMinutes],
    capacity: eventType.capacity,
    bufferBeforeMin: eventType.bufferBeforeMin,
    bufferAfterMin: eventType.bufferAfterMin,
    minimumNoticeMin: eventType.minimumNoticeMin,
    rollingWindowDays: eventType.rollingWindowDays,
    mode: eventType.mode,
    scheduleId: eventType.scheduleId,
    teamId: eventType.teamId,
    theme: eventType.theme,
    layout: eventType.layout ?? "focus",
    logoUrl: eventType.logoUrl ?? null,
    meetingFormats: eventType.meetingFormats ?? ["google_meet"],
    locations: eventType.locations?.length
      ? eventType.locations
      : (eventType.meetingFormats ?? ["google_meet"]).map((format) => format === "phone"
        ? {
            id: "phone",
            type: "phone" as const,
            label: "Phone call",
            phoneDirection: "organizer_calls_invitee" as const,
          }
        : { id: "google-meet", type: "google_meet" as const, label: "Google Meet" }),
    bookingQuestions: eventType.bookingQuestions ?? [],
    emailVerificationRequired: eventType.emailVerificationRequired ?? false,
    hosts: eventType.hosts.map(({ userId, role, weight }) => ({ userId, role, weight })),
  };
}

function EventTypesTab({
  users,
  initialEditor,
  onEdit,
  onCloseEditor,
}: {
  users: DirectoryUser[];
  initialEditor?: "new" | string;
  onEdit: (eventTypeId: "new" | string) => void;
  onCloseEditor: () => void;
}) {
  const [eventTypes, setEventTypes] = useState<AdminEventType[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableThemes, setAvailableThemes] = useState<PresentationOption[]>([...themeOptions]);
  const [availableLayouts, setAvailableLayouts] = useState<PresentationOption[]>([
    { value: "focus", label: "Focus" },
    { value: "split", label: "Split" },
    { value: "compact", label: "Compact" },
  ]);
  const [editing, setEditing] = useState<{ id: string | null; form: EventTypeInput } | null>(
    initialEditor === "new" ? { id: null, form: DEFAULT_EVENT_TYPE } : null,
  );
  const loadedEditorRef = useRef<string | null>(initialEditor === "new" ? "new" : null);
  const [editorNotFound, setEditorNotFound] = useState(false);
  const [embed, setEmbed] = useState<{ slug: string; mode: "inline" | "popup" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<Array<{
    path: Array<string | number>;
    message: string;
  }>>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [bookingBase, setBookingBase] = useState(window.location.origin);

  const reload = useCallback(() => {
    listEventTypes()
      .then((r) => setEventTypes(r.eventTypes))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    reload();
    listSchedules().then((r) => setSchedules(r.schedules)).catch(() => undefined);
    listTeams().then((r) => setTeams(r.teams)).catch(() => undefined);
    listPresentationOptions().then((options) => {
      setAvailableThemes(options.themes);
      setAvailableLayouts(options.layouts);
    }).catch(() => undefined);
    getWorkspace().then(({ workspace, domains, deploymentMode }) => {
      const customDomain = domains.find((domain) => domain.status === "verified" && domain.isPrimary)
        ?? domains.find((domain) => domain.status === "verified");
      if (customDomain) {
        setBookingBase(`https://${customDomain.hostname}`);
      } else if (deploymentMode === "hosted") {
        setBookingBase(`https://calpaca.io/book/${workspace.slug}`);
      } else {
        setBookingBase(window.location.origin);
      }
    }).catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    if (!initialEditor) {
      loadedEditorRef.current = null;
      setEditorNotFound(false);
      setEditing(null);
      return;
    }
    if (loadedEditorRef.current === initialEditor) return;
    if (initialEditor === "new") {
      loadedEditorRef.current = initialEditor;
      setEditorNotFound(false);
      setEditing({ id: null, form: DEFAULT_EVENT_TYPE });
      return;
    }
    if (!eventTypes) return;
    const eventType = eventTypes.find((candidate) => candidate.id === initialEditor);
    loadedEditorRef.current = initialEditor;
    if (!eventType) {
      setEditing(null);
      setEditorNotFound(true);
      return;
    }
    setEditorNotFound(false);
    setEditing({ id: eventType.id, form: eventTypeToInput(eventType) });
  }, [eventTypes, initialEditor]);

  const save = async () => {
    if (!editing) return;
    setError(null);
    setValidationIssues([]);
    try {
      if (editing.id) await updateEventType(editing.id, editing.form);
      else await createEventType(editing.form);
      reload();
      onCloseEditor();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.code === "invalid_body" && e.issues) {
        setValidationIssues(e.issues.map((issue) => ({
          path: issue.path ?? (issue.field ? [issue.field] : []),
          message: issue.message ?? issue.reason ?? "This value is invalid.",
        })));
      }
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
    const url = bookingBase.includes("/book/")
      ? `${bookingBase}/${slug}`
      : `${bookingBase}/book/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the booking link. Try again."));
  };

  const copyBookingPage = () => {
    const url = bookingBase.includes("/book/")
      ? bookingBase.replace("/book/", "/booking/")
      : `${bookingBase}/booking`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied("booking-page");
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the booking page link. Try again."));
  };

  const embedSnippet = (slug: string, mode: "inline" | "popup") => {
    const bookingUrl = bookingBase.includes("/book/")
      ? `${bookingBase}/${slug}`
      : `${bookingBase}/book/${slug}`;
    const loader = `<script async src="${window.location.origin}/embed.js"></script>`;
    return mode === "inline"
      ? `<div data-calpaca-inline="${bookingUrl}"></div>\n${loader}`
      : `<button type="button" data-calpaca-popup="${bookingUrl}">Book a meeting</button>\n${loader}`;
  };

  const copyEmbed = (slug: string, mode: "inline" | "popup") => {
    void navigator.clipboard.writeText(embedSnippet(slug, mode)).then(() => {
      setCopied(`embed-${slug}-${mode}`);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the embed code. Try again."));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-xl">Event types</CardTitle>
          <CardDescription>What invitees can book, and with whom.</CardDescription>
        </div>
        {!initialEditor && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyBookingPage}>
              <Copy className="mr-1 h-4 w-4" />
              <CopyFeedbackLabel copied={copied === "booking-page"} idle="Booking page" />
            </Button>
            <Button size="sm" onClick={() => onEdit("new")}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {validationIssues.length > 0 && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/8 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">Please fix the following:</p>
            <ul className="mt-2 space-y-1.5 text-sm text-destructive">
              {validationIssues.map((issue, index) => {
                const field = String(issue.path[0] ?? "form");
                const label = field
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (character) => character.toUpperCase());
                const fieldIds: Record<string, string> = {
                  title: "et-title",
                  description: "et-description",
                  slug: "et-slug",
                  durationMinutes: "et-duration",
                  capacity: "et-capacity",
                  mode: "et-mode",
                  bufferBeforeMin: "et-buffer-before",
                  bufferAfterMin: "et-buffer-after",
                  minimumNoticeMin: "et-notice",
                  rollingWindowDays: "et-window",
                  scheduleId: "et-schedule",
                  theme: "et-theme",
                  logoUrl: "et-logo",
                  teamId: "et-team",
                };
                return (
                  <li key={`${issue.path.join(".")}-${index}`}>
                    <button
                      type="button"
                      className="text-left underline decoration-destructive/35 underline-offset-2"
                      onClick={() => document.getElementById(fieldIds[field] ?? "")?.focus()}
                    >
                      <span className="font-medium">{label}</span>: {issue.message}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {editorNotFound ? (
          <ActionableEmptyState
            title="Event type not found"
            description="It may have been deleted, or the link may be incorrect."
            action={<Button size="sm" onClick={onCloseEditor}>Return to event types</Button>}
          />
        ) : initialEditor && !editing ? (
          <InlineLoading label="Loading event type…" />
        ) : editing ? (
          <EventTypeForm
            eventTypeId={editing.id}
            form={editing.form}
            validationIssues={validationIssues}
            users={users}
            schedules={schedules}
            teams={teams}
            themes={availableThemes}
            layouts={availableLayouts}
            onChange={(form) => {
              setValidationIssues([]);
              setEditing({ ...editing, form });
            }}
            onCancel={onCloseEditor}
            onSave={() => void save()}
          />
        ) : !eventTypes ? (
          <InlineLoading label="Loading event types…" />
        ) : eventTypes.length === 0 ? (
          <ActionableEmptyState
            title="No event types yet"
            description="Create a bookable meeting with its own duration, hosts, availability, and location."
            action={<Button size="sm" onClick={() => onEdit("new")}><Plus className="h-4 w-4" /> Create an event type</Button>}
          />
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
                    /{et.slug} · {(et.selectableDurations?.length ?? 0) > 1
                      ? `${et.selectableDurations!.join("/")} min`
                      : `${et.durationMinutes} min`} · {et.mode.replace("_", " ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copyLink(et.slug)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    <CopyFeedbackLabel copied={copied === et.slug} idle="Link" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEmbed(embed?.slug === et.slug ? null : { slug: et.slug, mode: "inline" })}
                  >
                    <Code2 className="mr-1 h-3.5 w-3.5" />
                    Embed
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${et.title}`}
                    onClick={() => onEdit(et.id)}
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
                {embed?.slug === et.slug && (
                  <div className="basis-full rounded-lg border border-border bg-muted/35 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Add to your website</p>
                        <p className="text-xs text-muted-foreground">
                          The booking frame resizes automatically.
                        </p>
                      </div>
                      <div className="flex rounded-md border border-border bg-card p-0.5">
                        {(["inline", "popup"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                              embed.mode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                            }`}
                            onClick={() => setEmbed({ slug: et.slug, mode })}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <pre className="overflow-x-auto rounded-md bg-foreground p-3 text-xs leading-5 text-background">
                      <code>{embedSnippet(et.slug, embed.mode)}</code>
                    </pre>
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => copyEmbed(et.slug, embed.mode)}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        <CopyFeedbackLabel copied={copied === `embed-${et.slug}-${embed.mode}`} idle="Copy code" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {eventTypes && !editing && !initialEditor && (
          <BookingPagesManager
            eventTypes={eventTypes}
            bookingBase={bookingBase}
            themes={availableThemes}
          />
        )}
      </CardContent>
    </Card>
  );
}

const DEFAULT_BOOKING_PAGE: BookingPageInput = {
  slug: "",
  title: "",
  description: null,
  theme: "default",
  logoUrl: null,
  eventTypeIds: [],
};

type EventTypeSection = "hosts" | "availability" | "location" | "invitee" | "appearance" | "sharing";

const EVENT_TYPE_SECTION_FOR_FIELD: Partial<Record<keyof EventTypeInput, EventTypeSection>> = {
  hosts: "hosts",
  bufferBeforeMin: "availability",
  bufferAfterMin: "availability",
  minimumNoticeMin: "availability",
  rollingWindowDays: "availability",
  scheduleId: "availability",
  locations: "location",
  meetingFormats: "location",
  bookingQuestions: "invitee",
  emailVerificationRequired: "invitee",
  theme: "appearance",
  layout: "appearance",
  logoUrl: "sharing",
  teamId: "sharing",
};

function EventTypeDisclosure({
  section,
  title,
  description,
  open,
  onToggle,
  children,
}: {
  section: EventTypeSection;
  title: string;
  description: string;
  open: boolean;
  onToggle: (section: EventTypeSection, open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-border sm:col-span-2"
      open={open}
      onToggle={(event) => onToggle(section, event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function BookingPagesManager({
  eventTypes,
  bookingBase,
  themes,
}: {
  eventTypes: AdminEventType[];
  bookingBase: string;
  themes: PresentationOption[];
}) {
  const [pages, setPages] = useState<BookingPageRecord[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: BookingPageInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const reload = useCallback(() => {
    void listBookingPages().then(({ bookingPages }) => setPages(bookingPages))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(reload, [reload]);

  const pageUrl = (slug: string) => bookingBase.includes("/book/")
    ? `${bookingBase.replace("/book/", "/booking/")}/p/${slug}`
    : `${bookingBase}/booking/p/${slug}`;

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.id) await updateBookingPage(editing.id, editing.form);
      else await createBookingPage(editing.form);
      setEditing(null);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section className="mt-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Custom booking pages</h3>
          <p className="text-sm text-muted-foreground">Group selected event types on a themed public page.</p>
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing({ id: null, form: DEFAULT_BOOKING_PAGE })}
          >
            <Plus className="mr-1 h-4 w-4" /> New page
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {editing ? (
        <form
          className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={editing.form.title}
              onChange={(event) => {
                const title = event.target.value;
                const derived = editing.form.slug === slugify(editing.form.title);
                setEditing({ ...editing, form: {
                  ...editing.form,
                  title,
                  slug: derived ? slugify(title) : editing.form.slug,
                } });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-slug">Slug</Label>
            <Input
              id="page-slug"
              value={editing.form.slug}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, slug: event.target.value },
              })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="page-description">Description</Label>
            <Textarea
              id="page-description"
              value={editing.form.description ?? ""}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, description: event.target.value || null },
              })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-theme">Theme</Label>
            <select
              id="page-theme"
              className="h-9 rounded-md border border-border bg-card px-3 text-sm"
              value={editing.form.theme}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, theme: event.target.value },
              })}
            >
              {themes.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-logo">Logo URL</Label>
            <Input
              id="page-logo"
              type="url"
              value={editing.form.logoUrl ?? ""}
              onChange={(event) => setEditing({
                ...editing,
                form: { ...editing.form, logoUrl: event.target.value || null },
              })}
            />
          </div>
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="text-sm font-medium">Events to show</legend>
            {eventTypes.map((eventType) => (
              <label key={eventType.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.form.eventTypeIds.includes(eventType.id)}
                  onChange={(event) => setEditing({
                    ...editing,
                    form: {
                      ...editing.form,
                      eventTypeIds: event.target.checked
                        ? [...editing.form.eventTypeIds, eventType.id]
                        : editing.form.eventTypeIds.filter((id) => id !== eventType.id),
                    },
                  })}
                />
                {eventType.title}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={!editing.form.title || !editing.form.slug || !editing.form.eventTypeIds.length}>
              Save page
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <span className="grow">
                <span className="font-medium">{page.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {page.eventTypeIds.length} event{page.eventTypeIds.length === 1 ? "" : "s"} · {page.theme}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => {
                void navigator.clipboard.writeText(pageUrl(page.slug)).then(() => {
                  setCopied(page.id);
                  setTimeout(() => setCopied(null), 1500);
                }).catch(() => setError("Could not copy the booking page link. Try again."));
              }}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                <CopyFeedbackLabel copied={copied === page.id} idle="Link" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({
                id: page.id,
                form: {
                  slug: page.slug,
                  title: page.title,
                  description: page.description,
                  theme: page.theme,
                  logoUrl: page.logoUrl,
                  eventTypeIds: page.eventTypeIds,
                },
              })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => {
                void deleteBookingPage(page.id).then(reload).catch((e: unknown) => setError(errorText(e)));
              }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
          {!pages.length && (
            <li>
              <ActionableEmptyState
                title="No custom booking pages yet"
                description="Combine selected event types into one public page for a client, service, or campaign."
                action={<Button type="button" size="sm" variant="outline" onClick={() => setEditing({ id: null, form: DEFAULT_BOOKING_PAGE })}><Plus className="h-4 w-4" /> Create a booking page</Button>}
              />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function EventTypeForm({
  eventTypeId,
  form,
  validationIssues,
  users,
  schedules,
  teams,
  themes,
  layouts,
  onChange,
  onCancel,
  onSave,
}: {
  eventTypeId: string | null;
  form: EventTypeInput;
  validationIssues: Array<{ path: Array<string | number>; message: string }>;
  users: DirectoryUser[];
  schedules: Schedule[];
  teams: Team[];
  themes: PresentationOption[];
  layouts: PresentationOption[];
  onChange: (form: EventTypeInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [openSections, setOpenSections] = useState<Set<EventTypeSection>>(
    () => new Set(["hosts"]),
  );
  const set = <K extends keyof EventTypeInput>(key: K, value: EventTypeInput[K]) =>
    onChange({ ...form, [key]: value });
  const fieldError = (field: keyof EventTypeInput) =>
    validationIssues.find((issue) => issue.path[0] === field)?.message;
  const invalidProps = (field: keyof EventTypeInput) => {
    const message = fieldError(field);
    return message
      ? { "aria-invalid": true as const, "aria-describedby": `et-${field}-error` }
      : {};
  };
  const FieldError = ({ field }: { field: keyof EventTypeInput }) => {
    const message = fieldError(field);
    return message
      ? <p id={`et-${field}-error`} className="text-xs text-destructive">{message}</p>
      : null;
  };
  const invalidSections = new Set(
    validationIssues
      .map((issue) => EVENT_TYPE_SECTION_FOR_FIELD[issue.path[0] as keyof EventTypeInput])
      .filter((section): section is EventTypeSection => section !== undefined),
  );
  const toggleSection = (section: EventTypeSection, open: boolean) => {
    if (!open && invalidSections.has(section)) {
      setOpenSections((current) => new Set(current));
      return;
    }
    setOpenSections((current) => {
      const next = new Set(current);
      if (open) next.add(section);
      else next.delete(section);
      return next;
    });
  };

  useEffect(() => {
    const invalidSections = validationIssues
      .map((issue) => EVENT_TYPE_SECTION_FOR_FIELD[issue.path[0] as keyof EventTypeInput])
      .filter((section): section is EventTypeSection => section !== undefined);
    if (invalidSections.length === 0) return;
    setOpenSections((current) => new Set([...current, ...invalidSections]));
  }, [validationIssues]);

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
      <div>
        <h3 className="text-sm font-medium">Basics</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">What people book and how long it takes.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-title">Title</Label>
          <Input
            id="et-title"
            {...invalidProps("title")}
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              const slugWasDerived = form.slug === slugify(form.title);
              onChange({ ...form, title, slug: slugWasDerived ? slugify(title) : form.slug });
            }}
          />
          <FieldError field="title" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="et-description">Meeting description</Label>
          <Textarea
            id="et-description"
            {...invalidProps("description")}
            maxLength={2000}
            value={form.description ?? ""}
            placeholder="Tell invitees what to expect and how to prepare."
            onChange={(e) => set("description", e.target.value || null)}
          />
          <FieldError field="description" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-slug">Slug</Label>
          <Input
            id="et-slug"
            {...invalidProps("slug")}
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="intro-call"
          />
          <FieldError field="slug" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-duration">Duration (min)</Label>
          <Input
            id="et-duration"
            {...invalidProps("durationMinutes")}
            type="number"
            min={5}
            max={480}
            value={form.durationMinutes}
            onChange={(e) => {
              const durationMinutes = Number(e.target.value);
              onChange({
                ...form,
                durationMinutes,
                selectableDurations: [
                  ...new Set([...(form.selectableDurations ?? []), durationMinutes]),
                ].sort((a, b) => a - b),
              });
            }}
          />
          <FieldError field="durationMinutes" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Invitee duration choices</Label>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 45, 60, 90, 120].map((minutes) => {
              const selected = (form.selectableDurations ?? [form.durationMinutes]).includes(minutes);
              const isDefault = minutes === form.durationMinutes;
              return (
                <Button
                  key={minutes}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  disabled={isDefault}
                  onClick={() => {
                    const current = form.selectableDurations ?? [form.durationMinutes];
                    set("selectableDurations", selected
                      ? current.filter((duration) => duration !== minutes)
                      : [...current, minutes].sort((a, b) => a - b));
                  }}
                >
                  {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
                  {isDefault ? " · default" : ""}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            The default duration is always available. Add choices invitees can select before viewing times.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-capacity">Seats per time</Label>
          <Input
            id="et-capacity"
            {...invalidProps("capacity")}
            type="number"
            min={1}
            max={500}
            value={form.capacity}
            onChange={(e) => {
              const capacity = Number(e.target.value);
              onChange({
                ...form,
                capacity,
                ...(capacity > 1 ? { mode: "solo" as const } : {}),
              });
            }}
          />
          <FieldError field="capacity" />
          <p className="text-xs text-muted-foreground">
            Use more than one for a shared session. Capacity sessions use solo mode.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-mode">Mode</Label>
          <select
            id="et-mode"
            {...invalidProps("mode")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("mode") ? "border-destructive" : "border-border"}`}
            value={form.mode}
            onChange={(e) => {
              const mode = e.target.value as EventTypeInput["mode"];
              onChange({
                ...form,
                mode,
                ...(mode !== "solo" ? { capacity: 1 } : {}),
              });
            }}
          >
            <option value="solo">Solo</option>
            <option value="round_robin">Round robin</option>
            <option value="group">Group (all hosts)</option>
          </select>
          <FieldError field="mode" />
        </div>
        <EventTypeDisclosure
          section="availability"
          title="Availability"
          description="Schedules, booking limits, notice, and buffers."
          open={openSections.has("availability")}
          onToggle={toggleSection}
        >
          <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-buffer-before">Buffer before (min)</Label>
          <Input
            id="et-buffer-before"
            {...invalidProps("bufferBeforeMin")}
            type="number"
            min={0}
            max={240}
            value={form.bufferBeforeMin}
            onChange={(e) => set("bufferBeforeMin", Number(e.target.value))}
          />
          <FieldError field="bufferBeforeMin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-buffer-after">Buffer after (min)</Label>
          <Input
            id="et-buffer-after"
            {...invalidProps("bufferAfterMin")}
            type="number"
            min={0}
            max={240}
            value={form.bufferAfterMin}
            onChange={(e) => set("bufferAfterMin", Number(e.target.value))}
          />
          <FieldError field="bufferAfterMin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-notice">Minimum notice (min)</Label>
          <Input
            id="et-notice"
            {...invalidProps("minimumNoticeMin")}
            type="number"
            min={0}
            max={10080}
            value={form.minimumNoticeMin}
            onChange={(e) => set("minimumNoticeMin", Number(e.target.value))}
          />
          <FieldError field="minimumNoticeMin" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-window">Booking window (days)</Label>
          <Input
            id="et-window"
            {...invalidProps("rollingWindowDays")}
            type="number"
            min={1}
            max={90}
            value={form.rollingWindowDays}
            onChange={(e) => set("rollingWindowDays", Number(e.target.value))}
          />
          <FieldError field="rollingWindowDays" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-schedule">Schedule</Label>
          <select
            id="et-schedule"
            {...invalidProps("scheduleId")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("scheduleId") ? "border-destructive" : "border-border"}`}
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
          <FieldError field="scheduleId" />
        </div>
        {eventTypeId && (
          <div className="sm:col-span-2">
            <a
              href={`/app/workspace/availability?view=troubleshooter&eventTypeId=${encodeURIComponent(eventTypeId)}&durationMinutes=${form.durationMinutes}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8"
            >
              <SearchCheck className="h-4 w-4" />
              Inspect a time for this event type
            </a>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Opens the availability troubleshooter in a new tab, so this draft stays here.
            </p>
          </div>
        )}
          </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="appearance"
          title="Appearance"
          description="Theme and booking-page layout."
          open={openSections.has("appearance")}
          onToggle={toggleSection}
        >
          <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-theme">Theme</Label>
          <select
            id="et-theme"
            {...invalidProps("theme")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("theme") ? "border-destructive" : "border-border"}`}
            value={form.theme}
            onChange={(e) => set("theme", e.target.value)}
          >
            {themes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError field="theme" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Booking layout</Label>
          <div className="grid grid-cols-3 gap-2">
            {layouts.map((layout) => {
              const active = (form.layout ?? "focus") === layout.value;
              return (
                <button
                  key={layout.value}
                  type="button"
                  className={`rounded-lg border p-3 text-left transition ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
                  }`}
                  onClick={() => set("layout", layout.value as EventTypeInput["layout"])}
                >
                  <span className={`mb-2 block h-8 rounded border ${layout.value === "split" ? "bg-[linear-gradient(90deg,var(--muted)_38%,var(--card)_38%)]" : layout.value === "compact" ? "mx-auto w-2/3 bg-muted" : "bg-card"}`} />
                  <span className="block text-xs font-medium">{layout.label}</span>
                </button>
              );
            })}
          </div>
        </div>
          </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="location"
          title="Location"
          description="Where the meeting happens and what invitees need to know."
          open={openSections.has("location")}
          onToggle={toggleSection}
        >
        <div className="flex flex-col gap-3">
          <div>
            <Label>Locations</Label>
            <p className="text-xs text-muted-foreground">Invitees choose one. Team hosts may override the details.</p>
          </div>
          {(form.locations ?? []).map((location, index) => {
            const setLocation = (patch: Partial<typeof location>) => set(
              "locations",
              (form.locations ?? []).map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...patch } : item),
            );
            const detailKey = location.type === "in_person"
              ? "address"
              : location.type === "custom_url" ? "url" : location.type === "phone" ? "phoneNumber" : null;
            return (
              <div key={location.id} className="space-y-3 rounded-xl border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                  <Input value={location.label} placeholder="Location label" onChange={(event) => setLocation({ label: event.target.value })} />
                  <select className="h-9 rounded-md border border-border bg-card px-3 text-sm" value={location.type} onChange={(event) => {
                    const type = event.target.value as typeof location.type;
                    setLocation({
                      type,
                      ...(type === "phone" ? { phoneDirection: "organizer_calls_invitee" } : {}),
                    });
                  }}>
                    <option value="google_meet">Google Meet</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                    <option value="custom_url">Custom URL</option>
                  </select>
                  <Button type="button" variant="ghost" size="sm" disabled={(form.locations?.length ?? 0) === 1} onClick={() => set(
                    "locations",
                    (form.locations ?? []).filter((_, itemIndex) => itemIndex !== index),
                  )}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {detailKey && (
                  <Input
                    type={detailKey === "url" ? "url" : "text"}
                    placeholder={detailKey === "address" ? "Address" : detailKey === "url" ? "https://…" : "Organizer phone number (if invitee calls)"}
                    value={location[detailKey] ?? ""}
                    onChange={(event) => setLocation({ [detailKey]: event.target.value || undefined })}
                  />
                )}
                {location.type === "phone" && (
                  <select className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm" value={location.phoneDirection ?? "organizer_calls_invitee"} onChange={(event) => setLocation({
                    phoneDirection: event.target.value as NonNullable<typeof location.phoneDirection>,
                  })}>
                    <option value="organizer_calls_invitee">Organizer calls invitee</option>
                    <option value="invitee_calls_organizer">Invitee calls organizer</option>
                  </select>
                )}
                <Textarea value={location.instructions ?? ""} placeholder="Instructions (optional)" onChange={(event) => setLocation({ instructions: event.target.value || undefined })} />
                {form.hosts.length > 1 && detailKey && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Per-host override</p>
                    {form.hosts.map((host) => {
                      const person = users.find((user) => user.id === host.userId);
                      const override = location.hostOverrides?.[host.userId] ?? {};
                      return (
                        <div key={host.userId} className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
                          <span className="truncate text-xs">{person?.name ?? host.userId}</span>
                          <Input
                            placeholder={`Use default ${detailKey.replace(/([A-Z])/g, " $1").toLowerCase()}`}
                            value={override[detailKey] ?? ""}
                            onChange={(event) => setLocation({
                              hostOverrides: {
                                ...(location.hostOverrides ?? {}),
                                [host.userId]: { ...override, [detailKey]: event.target.value || undefined },
                              },
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="self-start" onClick={() => {
            const next = (form.locations?.length ?? 0) + 1;
            set("locations", [
              ...(form.locations ?? []),
              { id: `location-${next}`, type: "in_person", label: "In person", address: "" },
            ]);
          }}><Plus className="h-4 w-4" /> Add location</Button>
        </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="invitee"
          title="Invitee form"
          description="Verification and questions collected before confirmation."
          open={openSections.has("invitee")}
          onToggle={toggleSection}
        >
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={form.emailVerificationRequired ?? false}
              onChange={(event) => set("emailVerificationRequired", event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Verify invitee email before booking</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Send a six-digit code before confirmation. Verified browsers are trusted for 30 days.
              </span>
            </span>
          </label>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Booking questions</Label>
            <p className="text-xs text-muted-foreground">Collect structured information with each booking. Hidden fields accept URL-prefilled or API values.</p>
          </div>
          {(form.bookingQuestions ?? []).map((question, index) => {
            const setQuestion = (patch: Partial<typeof question>) => set(
              "bookingQuestions",
              (form.bookingQuestions ?? []).map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...patch } : item,
              ),
            );
            const usesOptions = question.type === "select" || question.type === "multiselect";
            return (
              <div key={question.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_150px_auto]">
                <Input value={question.label} placeholder="Question label" onChange={(event) => setQuestion({
                  label: event.target.value,
                  id: question.id.startsWith("question-") ? `question-${index + 1}` : question.id,
                })} />
                <select className="h-9 rounded-md border border-border bg-card px-3 text-sm" value={question.type} onChange={(event) => setQuestion({
                  type: event.target.value as typeof question.type,
                  ...(event.target.value === "select" || event.target.value === "multiselect"
                    ? { options: question.options?.length ? question.options : ["Option 1"] }
                    : { options: undefined }),
                })}>
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Select</option>
                  <option value="multiselect">Multiselect</option>
                  <option value="phone">Phone</option>
                  <option value="checkbox">Checkbox</option>
                </select>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${question.label || "question"}`} onClick={() => set(
                  "bookingQuestions",
                  (form.bookingQuestions ?? []).filter((_, itemIndex) => itemIndex !== index),
                )}><Trash2 className="h-4 w-4" /></Button>
                <Input value={question.id} placeholder="field-id" onChange={(event) => setQuestion({ id: slugify(event.target.value) })} />
                <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-2">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={question.required} onChange={(event) => setQuestion({ required: event.target.checked })} /> Required</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={question.hidden} onChange={(event) => setQuestion({ hidden: event.target.checked })} /> Hidden</label>
                </div>
                {usesOptions && (
                  <Input className="sm:col-span-3" value={(question.options ?? []).join(", ")} placeholder="Option 1, Option 2" onChange={(event) => setQuestion({
                    options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
                  })} />
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="self-start" onClick={() => {
            const next = (form.bookingQuestions?.length ?? 0) + 1;
            set("bookingQuestions", [
              ...(form.bookingQuestions ?? []),
              { id: `question-${next}`, label: "", type: "text", required: false, hidden: false },
            ]);
          }}><Plus className="h-4 w-4" /> Add question</Button>
        </div>
        </div>
        </EventTypeDisclosure>
        <EventTypeDisclosure
          section="sharing"
          title="Sharing"
          description="Workspace ownership and public-page branding."
          open={openSections.has("sharing")}
          onToggle={toggleSection}
        >
          <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="et-logo">Whitelabel logo URL</Label>
          <Input
            id="et-logo"
            {...invalidProps("logoUrl")}
            type="url"
            value={form.logoUrl ?? ""}
            placeholder="https://example.com/logo.svg"
            onChange={(e) => set("logoUrl", e.target.value || null)}
          />
          <FieldError field="logoUrl" />
          <p className="text-xs text-muted-foreground">Optional. TourScale uses its private brand logo automatically.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="et-team">Team</Label>
          <select
            id="et-team"
            {...invalidProps("teamId")}
            className={`flex h-9 w-full rounded-md border bg-card px-3 py-1 text-sm shadow-sm ${fieldError("teamId") ? "border-destructive" : "border-border"}`}
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
          <FieldError field="teamId" />
        </div>
          </div>
        </EventTypeDisclosure>
      </div>

      <EventTypeDisclosure
        section="hosts"
        title="Hosts"
        description="People who can be assigned or must attend."
        open={openSections.has("hosts")}
        onToggle={toggleSection}
      >
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
      </EventTypeDisclosure>

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

// ---- profile and API tokens ----

function ProfileTab({ section }: { section: "profile" | "api" }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tokens, setTokens] = useState<ApiTokenRecord[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadTokens = useCallback(() => {
    listApiTokens()
      .then((result) => setTokens(result.tokens))
      .catch((reason: unknown) => setError(errorText(reason)));
  }, []);

  useEffect(() => {
    if (section === "profile") {
      getProfile()
        .then((result) => setProfile(result.profile))
        .catch((reason: unknown) => setError(errorText(reason)));
    } else {
      reloadTokens();
    }
  }, [reloadTokens, section]);

  const saveProfile = async () => {
    if (!profile) return;
    setError(null);
    try {
      const result = await updateProfile({
        name: profile.name,
        title: profile.title ?? null,
        timezone: profile.timezone,
        image: profile.image,
      });
      setProfile(result.profile);
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const readImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) {
      setError("Profile images must be 500 KB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && profile) {
        setProfile({ ...profile, image: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!tokenName.trim()) return;
    setError(null);
    try {
      const result = await createApiToken({ name: tokenName, expiresAt: null });
      setNewToken(result.token);
      setTokenCopied(false);
      setTokenName("");
      reloadTokens();
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  return (
    <div className="max-w-3xl">
      {section === "profile" && <Card>
        <CardHeader>
          <CardTitle className="text-xl">Profile</CardTitle>
          <CardDescription>This identity appears on your public booking pages.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!profile ? <InlineLoading label="Loading profile…" /> : (
            <>
              <div className="flex items-center gap-4">
                {profile.image ? (
                  <img
                    src={profile.image}
                    alt=""
                    className="h-16 w-16 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <UserRound className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Upload profile image"
                    onChange={(event) => readImage(event.target.files?.[0])}
                  />
                  {profile.image && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => setProfile({ ...profile, image: null })}
                    >
                      Remove image
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input value={profile.email} disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-title">Professional title</Label>
                <Input
                  id="profile-title"
                  placeholder="Founder, Customer Success, Designer…"
                  value={profile.title ?? ""}
                  onChange={(event) => setProfile({
                    ...profile,
                    title: event.target.value || null,
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Displayed with your name on public booking pages.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Timezone</Label>
                <div className="flex h-9 items-center rounded-md border border-border bg-card px-3">
                  <TimezoneSelect
                    value={profile.timezone}
                    onChange={(timezone) => setProfile({ ...profile, timezone })}
                  />
                </div>
              </div>
              <Button
                className="self-start"
                disabled={!profile.name.trim()}
                onClick={() => void saveProfile()}
              >
                Save profile
              </Button>
            </>
          )}
        </CardContent>
      </Card>}

      {section === "api" && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5" /> API tokens
          </CardTitle>
          <CardDescription>
            Personal bearer tokens have your account access. Store them like passwords.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {newToken && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-medium">Copy this token now</p>
              <p className="mt-1 text-xs text-muted-foreground">
                It will not be shown again.
              </p>
              <code className="mt-3 block overflow-x-auto rounded bg-card p-2 text-xs">
                {newToken}
              </code>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard.writeText(newToken)
                    .then(() => {
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 1500);
                    })
                    .catch(() => setError("Could not copy the token. Try again."));
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                <CopyFeedbackLabel copied={tokenCopied} idle="Copy" />
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="Token name, e.g. n8n"
              aria-label="Token name"
            />
            <Button disabled={!tokenName.trim()} onClick={() => void generate()}>
              Generate
            </Button>
          </div>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No personal tokens.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{token.name}</span>
                    <code className="text-xs text-muted-foreground">{token.prefix}…</code>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void revokeApiToken(token.id).then(reloadTokens)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}

function WorkspaceCard() {
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [domains, setDomains] = useState<WorkspaceDomain[]>([]);
  const [deploymentMode, setDeploymentMode] = useState<"hosted" | "self_hosted">("self_hosted");
  const [hostname, setHostname] = useState("");
  const [dnsRecord, setDnsRecord] = useState<{ name: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getWorkspace()
      .then((result) => {
        setWorkspace(result.workspace);
        setDomains(result.domains);
        setDeploymentMode(result.deploymentMode);
      })
      .catch((reason: unknown) => setError(errorText(reason)));
  }, []);

  useEffect(() => reload(), [reload]);

  const addDomain = async () => {
    setError(null);
    try {
      const result = await addWorkspaceDomain(hostname);
      setDnsRecord(result.domain.dnsRecord);
      setHostname("");
      reload();
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle className="text-xl">Workspace</CardTitle>
        <CardDescription>
          Plan, deployment mode, and verified booking domains.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!workspace ? <InlineLoading label="Loading workspace…" /> : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  value={workspace.name}
                  onChange={(event) => setWorkspace({ ...workspace, name: event.target.value })}
                  disabled={!["owner", "admin"].includes(workspace.role)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!workspace.name.trim() || !["owner", "admin"].includes(workspace.role)}
                onClick={() => void updateWorkspace(workspace.name).then(reload)}
              >
                Save
              </Button>
              <span className="rounded-md bg-muted px-3 py-2 text-center text-xs font-medium">
                {workspace.plan.replace("_", " ")} · {deploymentMode.replace("_", "-")}
              </span>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium">Custom domains</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add the hostname here first. DNS remains under your control until verification.
              </p>
              {workspace.entitlements.customDomains ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={hostname}
                    onChange={(event) => setHostname(event.target.value.toLowerCase())}
                    placeholder="cal.example.com"
                    aria-label="Custom hostname"
                  />
                  <Button
                    disabled={!hostname.trim() || !["owner", "admin"].includes(workspace.role)}
                    onClick={() => void addDomain()}
                  >
                    Add domain
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Custom domains require a paid hosted plan.
                </p>
              )}
            </div>

            {dnsRecord && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium">Add this DNS verification record</p>
                <code className="mt-2 block overflow-x-auto text-xs">
                  TXT {dnsRecord.name} {dnsRecord.value}
                </code>
              </div>
            )}

            {domains.length > 0 && (
              <ul className="flex flex-col gap-2">
                {domains.map((domain) => (
                  <li
                    key={domain.id}
                    className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{domain.hostname}</span>
                      <span className="text-xs text-muted-foreground">{domain.status}</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={domain.status === "verified" || !["owner", "admin"].includes(workspace.role)}
                      onClick={() => void verifyWorkspaceDomain(domain.id)
                        .then(reload)
                        .catch((reason: unknown) => setError(errorText(reason)))}
                    >
                      {domain.status === "verified" ? "Verified" : "Verify DNS"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!["owner", "admin"].includes(workspace.role)}
                      onClick={() => void removeWorkspaceDomain(domain.id).then(reload)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---- schedules ----

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SCHEDULE: ScheduleInput = {
  name: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  rules: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" })),
  overrides: [],
};

function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: ScheduleInput } | null>(null);
  const [people, setPeople] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listSchedules()
      .then((r) => setSchedules(r.schedules))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => reload(), [reload]);
  useEffect(() => {
    listUsers().then((result) => setPeople(result.users)).catch(() => undefined);
  }, []);

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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {editing ? (
          <ScheduleForm
            form={editing.form}
            onChange={(form) => setEditing({ ...editing, form })}
            onCancel={() => setEditing(null)}
            onSave={() => void save()}
            people={people}
          />
        ) : !schedules ? (
          <InlineLoading label="Loading availability schedules…" />
        ) : schedules.length === 0 ? (
          <ActionableEmptyState
            title="No availability schedules yet"
            description="Set the weekly hours when invitees can book you."
            action={<Button size="sm" onClick={() => setEditing({ id: null, form: DEFAULT_SCHEDULE })}><Plus className="h-4 w-4" /> Create a schedule</Button>}
          />
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
                      form: {
                        name: s.name,
                        timezone: s.timezone,
                        rules: s.rules,
                        overrides: s.overrides ?? [],
                      },
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
  people,
}: {
  form: ScheduleInput;
  onChange: (form: ScheduleInput) => void;
  onCancel: () => void;
  onSave: () => void;
  people: DirectoryUser[];
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
    form.name.trim() !== "" &&
    form.rules.length > 0 &&
    form.rules.every((r) => r.start < r.end) &&
    form.overrides.every((override) =>
      override.startDate !== "" &&
      override.endDate >= override.startDate &&
      (override.kind === "unavailable" || (
        !!override.start &&
        !!override.end &&
        override.start < override.end
      )),
    );

  const addOverride = () => {
    const date = new Date().toISOString().slice(0, 10);
    onChange({
      ...form,
      overrides: [
        ...form.overrides,
        { startDate: date, endDate: date, kind: "unavailable" },
      ],
    });
  };

  const updateOverride = (index: number, patch: Partial<ScheduleOverride>) => {
    onChange({
      ...form,
      overrides: form.overrides.map((override, current) =>
        current === index ? { ...override, ...patch } : override,
      ),
    });
  };

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

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Date overrides</p>
            <p className="text-xs text-muted-foreground">
              Block time off or replace recurring hours on specific dates.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addOverride}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {form.overrides.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            No date-specific changes.
          </p>
        ) : form.overrides.map((override, index) => (
          <div
            key={`${index}-${override.startDate}`}
            className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`override-kind-${index}`}>Type</Label>
              <select
                id={`override-kind-${index}`}
                className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                value={override.kind}
                onChange={(event) => {
                  const kind = event.target.value as ScheduleOverride["kind"];
                  updateOverride(index, kind === "available"
                    ? {
                        kind,
                        start: override.start ?? "09:00",
                        end: override.end ?? "17:00",
                        forwardToUserId: null,
                      }
                    : { kind });
                }}
              >
                <option value="unavailable">Time off</option>
                <option value="available">Alternate hours</option>
              </select>
            </div>
            <div className="flex items-end justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange({
                  ...form,
                  overrides: form.overrides.filter((_, current) => current !== index),
                })}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`override-start-date-${index}`}>From</Label>
              <Input
                id={`override-start-date-${index}`}
                type="date"
                value={override.startDate}
                onChange={(event) => updateOverride(index, {
                  startDate: event.target.value,
                  ...(override.endDate < event.target.value ? { endDate: event.target.value } : {}),
                })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`override-end-date-${index}`}>Through</Label>
              <Input
                id={`override-end-date-${index}`}
                type="date"
                min={override.startDate}
                value={override.endDate}
                onChange={(event) => updateOverride(index, { endDate: event.target.value })}
              />
            </div>
            {override.kind === "available" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`override-start-${index}`}>Start</Label>
                  <Input
                    id={`override-start-${index}`}
                    type="time"
                    value={override.start ?? ""}
                    onChange={(event) => updateOverride(index, { start: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`override-end-${index}`}>End</Label>
                  <Input
                    id={`override-end-${index}`}
                    type="time"
                    value={override.end ?? ""}
                    onChange={(event) => updateOverride(index, { end: event.target.value })}
                  />
                </div>
              </>
            )}
            {override.kind === "unavailable" && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`override-forward-${index}`}>Forward bookings (optional)</Label>
                <select
                  id={`override-forward-${index}`}
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                  value={override.forwardToUserId ?? ""}
                  onChange={(event) => updateOverride(index, {
                    forwardToUserId: event.target.value || null,
                  })}
                >
                  <option value="">Do not forward</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} · {person.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
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
  const [routingBase, setRoutingBase] = useState(window.location.origin);

  const reload = useCallback(() => {
    listRoutingForms()
      .then((r) => setForms(r.forms))
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    reload();
    listEventTypes().then((r) => setEventTypes(r.eventTypes)).catch(() => undefined);
    listTeams().then((r) => setTeams(r.teams)).catch(() => undefined);
    getWorkspace().then(({ workspace, domains, deploymentMode }) => {
      const customDomain = domains.find((domain) => domain.status === "verified" && domain.isPrimary)
        ?? domains.find((domain) => domain.status === "verified");
      if (customDomain) {
        setRoutingBase(`https://${customDomain.hostname}`);
      } else if (deploymentMode === "hosted") {
        setRoutingBase(`https://calpaca.io/r/${workspace.slug}`);
      } else {
        setRoutingBase(window.location.origin);
      }
    }).catch(() => undefined);
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
    const url = routingBase.includes("/r/")
      ? `${routingBase}/${slug}`
      : `${routingBase}/r/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => setError("Could not copy the routing link. Try again."));
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
          <InlineLoading label="Loading routing forms…" />
        ) : forms.length === 0 ? (
          <ActionableEmptyState
            title="No routing forms yet"
            description="Ask a few questions, then direct each invitee to the right event or team."
            action={<Button size="sm" onClick={() => setEditing({ id: null, form: DEFAULT_ROUTING_FORM })}><Plus className="h-4 w-4" /> Create a routing form</Button>}
          />
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
                  <CopyFeedbackLabel copied={copied === f.slug} idle="Link" />
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
          Custom condition (edited via the API). Kept as is.
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
                {!fieldKeys.includes(clause.field) && <option value={clause.field}>{clause.field || "Select a field"}</option>}
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
            <option value="">Select a field</option>
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
            <option value="">Select a value</option>
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

function UserManagementPanel() {
  const [directory, setDirectory] = useState<UserManagementDirectory | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    getUserManagement()
      .then(setDirectory)
      .catch((cause: unknown) => setError(errorText(cause)));
  }, []);

  useEffect(() => reload(), [reload]);

  const invite = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await inviteUser({ email, role });
      const messages = {
        sent: "Invitation sent.",
        not_configured: "Invitation created. Email delivery is not configured.",
        failed: "Invitation created, but email delivery failed.",
        existing_user: "Existing user reactivated and updated.",
      };
      setNotice(messages[result.delivery]);
      setEmail("");
      reload();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (
    user: UserManagementDirectory["users"][number],
    patch: { role?: AppRole; status?: "active" | "inactive" },
  ) => {
    if (
      patch.status === "inactive"
      && !window.confirm(`Deactivate ${user.name} (${user.email})? Their active sessions will end immediately.`)
    ) return;
    setError(null);
    try {
      await updateManagedUser(user.id, patch);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  if (!directory && !error) return <DashboardSkeleton />;
  if (!directory) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          User management is available to owners and admins.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">User management</CardTitle>
        </div>
        <CardDescription>Invite people, set access, and safely deactivate accounts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 sm:grid-cols-[1fr_140px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void invite();
          }}
        >
          <div>
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              {directory.actor.role === "owner" && <option value="owner">Owner</option>}
            </select>
          </div>
          <Button type="submit" disabled={saving || email.trim() === ""}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Invite
          </Button>
        </form>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-primary">{notice}</p>}

        <div className="divide-y divide-border rounded-xl border border-border/70">
          {directory.users.map((user) => {
            const canEditOwner = directory.actor.role === "owner" || user.role !== "owner";
            return (
              <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {user.name}
                    {user.id === directory.actor.id && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <select
                    aria-label={`Role for ${user.name}`}
                    className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                    value={user.role}
                    disabled={!canEditOwner}
                    onChange={(event) => void updateUser(user, { role: event.target.value as AppRole })}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    {directory.actor.role === "owner" && <option value="owner">Owner</option>}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEditOwner || user.id === directory.actor.id}
                    onClick={() => void updateUser(user, {
                      status: user.status === "active" ? "inactive" : "active",
                    })}
                  >
                    {user.status === "active" ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {directory.invitations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pending invitations
            </p>
            <div className="divide-y divide-border rounded-xl border border-border/70">
              {directory.invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void revokeUserInvitation(invitation.id).then(reload).catch((cause: unknown) => {
                        setError(errorText(cause));
                      });
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
    <div className="space-y-5">
      <UserManagementPanel />
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
          <InlineLoading label="Loading teams…" />
        ) : teams.length === 0 ? (
          <ActionableEmptyState
            title="No teams yet"
            description="Create a team to share round-robin and group event types with the right people."
            action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create a team</Button>}
          />
        ) : (
          teams.map((team) => (
            <TeamMembers key={team.id} team={team} users={users} onMembershipChange={reload} />
          ))
        )}
      </CardContent>
      </Card>
    </div>
  );
}

function TeamMembers({
  team,
  users,
  onMembershipChange,
}: {
  team: Team;
  users: DirectoryUser[];
  onMembershipChange: () => void;
}) {
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
      onMembershipChange();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const setAdmin = async (member: TeamMember, isAdmin: boolean) => {
    setError(null);
    try {
      await updateTeamMemberRole(team.id, member.userId, isAdmin);
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
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      {!members ? (
        <InlineLoading label="Loading team members…" />
      ) : (
        <>
          <ul className="mb-3 flex flex-col gap-1.5">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {m.name}
                  <span className="ml-2 text-xs text-muted-foreground">{m.email}</span>
                  <button
                    type="button"
                    className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => void setAdmin(m, !m.isAdmin)}
                    aria-label={`${m.isAdmin ? "Remove admin role from" : "Make admin"} ${m.name}`}
                  >
                    {m.isAdmin ? "Admin" : "Member"}
                  </button>
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

  async function updateConnection(
    cal: CalendarEntry,
    patch: { conflictEnabled?: boolean; isWriteDestination?: true },
  ) {
    if (!cal.connectionId) return;
    setBusyId(cal.id);
    setError(null);
    try {
      await updateCalendarConnection(cal.connectionId, patch);
      refresh();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Your calendars</CardTitle>
        <CardDescription>
          Choose calendars that block availability and where new bookings are written.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
        {!error && !calendars && <InlineLoading label="Loading calendars…" />}
        {calendars && (
          <ul className="flex flex-col gap-2">
            {calendars.map((cal) => (
              <li
                key={cal.id}
                className="grid gap-4 rounded-md border border-border px-4 py-4 text-sm lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{cal.summary}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {cal.id}{cal.primary ? " · Google primary" : ""}
                    </span>
                    <span className={`mt-1.5 inline-flex items-center gap-1.5 text-xs ${
                      !cal.connected || cal.syncHealthy === false ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {cal.connected && cal.syncHealthy !== false && <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                      {!cal.connected
                        ? "Not connected"
                        : cal.syncHealthy === false
                          ? "Sync needs attention"
                          : cal.lastSyncedAt
                            ? `Healthy · synced ${new Date(cal.lastSyncedAt).toLocaleString()}`
                            : "Connected · initial sync pending"}
                    </span>
                  </span>
                </div>
                {cal.connected && (
                  <div className="grid gap-2">
                    <label className="flex min-h-11 items-center gap-2 text-xs lg:min-h-0">
                      <input
                        type="checkbox"
                        checked={cal.conflictEnabled}
                        disabled={busyId !== null}
                        onChange={(event) => void updateConnection(cal, {
                          conflictEnabled: event.target.checked,
                        })}
                      />
                      Checks conflicts on this calendar
                    </label>
                    <Button
                      size="sm"
                      variant={cal.isWriteDestination ? "default" : "outline"}
                      disabled={
                        busyId !== null ||
                        cal.isWriteDestination ||
                        !["owner", "writer"].includes(cal.accessRole)
                      }
                      onClick={() => void updateConnection(cal, { isWriteDestination: true })}
                    >
                      {cal.isWriteDestination ? "Adds new meetings here" : "Use for new meetings"}
                    </Button>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void toggle(cal)}
                >
                  {busyId === cal.id ? "…" : cal.connected ? "Disconnect" : "Connect"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
