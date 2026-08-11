/** Defaults for the one schedule and one event type the wizard creates, so a
 * new host reaches a working link without opening the full editors. Every value
 * here is a starting point the host can change afterwards — nothing depends on
 * these staying as they are. */

export const STARTER_SCHEDULE_NAME = "Working hours";
export const STARTER_EVENT_DURATION_MINUTES = 30;

export interface StarterScheduleInput {
  name: string;
  timezone: string;
  rules: { dow: number; start: string; end: string }[];
  overrides: [];
}

/** Mon–Fri 09:00–17:00 in the host's own zone. Weekdays only: offering weekend
 * slots by default is the kind of wrong default a host discovers from an
 * unwanted Saturday booking. */
export function starterSchedule(timezone: string): StarterScheduleInput {
  return {
    name: STARTER_SCHEDULE_NAME,
    timezone,
    rules: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "17:00" })),
    overrides: [],
  };
}

/** Field-for-field the create-event-type contract in src/api/routes/admin.ts,
 * so the wizard can post this straight to the existing endpoint instead of
 * needing a bespoke starter route. */
export interface StarterEventTypeInput {
  slug: string;
  title: string;
  description: null;
  durationMinutes: number;
  capacity: 1;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minimumNoticeMin: number;
  rollingWindowDays: number;
  mode: "solo";
  scheduleId: string | null;
  teamId: null;
  folderId: null;
  theme: "default";
  meetingFormats: ["google_meet"];
  bookingQuestions: [];
  emailVerificationRequired: false;
  guestsEnabled: true;
  hosts: { userId: string; role: "member"; weight: 1 }[];
}

/** `attempt` disambiguates the slug when the host already owns one — the create
 * endpoint answers `slug_taken` and the wizard retries with the next attempt
 * rather than failing the step. */
export function starterEventTypeSlug(attempt = 0): string {
  return attempt === 0 ? "intro-call" : `intro-call-${attempt + 1}`;
}

export function starterEventType(input: {
  readonly userId: string;
  readonly scheduleId: string | null;
  readonly attempt?: number;
}): StarterEventTypeInput {
  return {
    slug: starterEventTypeSlug(input.attempt ?? 0),
    title: `${STARTER_EVENT_DURATION_MINUTES} minute meeting`,
    description: null,
    durationMinutes: STARTER_EVENT_DURATION_MINUTES,
    capacity: 1,
    // A 10-minute tail keeps back-to-back bookings from colliding with the
    // walk-away time every real meeting needs; a 2-hour notice floor stops a
    // stranger booking the next 10 minutes of the host's day.
    bufferBeforeMin: 0,
    bufferAfterMin: 10,
    minimumNoticeMin: 120,
    rollingWindowDays: 30,
    mode: "solo",
    scheduleId: input.scheduleId,
    teamId: null,
    folderId: null,
    theme: "default",
    meetingFormats: ["google_meet"],
    bookingQuestions: [],
    emailVerificationRequired: false,
    guestsEnabled: true,
    hosts: [{ userId: input.userId, role: "member", weight: 1 }],
  };
}
