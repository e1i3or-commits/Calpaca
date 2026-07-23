// Most client-side time work is rendering. Suggestions are the exception:
// invitees enter wall-clock values which must be converted in their chosen
// IANA zone before crossing the API boundary.

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function allTimezones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

export function formatDay(utc: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(new Date(utc));
}

export function formatTime(utc: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(utc));
}

export function formatDayTime(utc: string, timeZone: string): string {
  return `${formatDay(utc, timeZone)}, ${formatTime(utc, timeZone)}`;
}

/** Day key for grouping the slot wall, in the invitee's zone. */
export function dayKey(utc: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(utc));
}

export async function localSuggestionWindow(
  date: string,
  time: string,
  timeZone: string,
  durationMinutes: number,
): Promise<{ start: string; end: string }> {
  const { Temporal } = await import("@js-temporal/polyfill");
  const start = Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant();
  return {
    start: start.toString(),
    end: start.add({ minutes: durationMinutes }).toString(),
  };
}

export async function isFutureInstant(instant: string): Promise<boolean> {
  const { Temporal } = await import("@js-temporal/polyfill");
  return Temporal.Instant.compare(Temporal.Instant.from(instant), Temporal.Now.instant()) > 0;
}

export function currentLocalDateTime(timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
    time: `${parts["hour"]}:${parts["minute"]}`,
  };
}
