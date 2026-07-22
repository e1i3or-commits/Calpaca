// Client-side rendering only: all math happened server-side, these format
// UTC instants into the invitee's zone for display.

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
