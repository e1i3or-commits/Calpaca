import { Temporal } from "@js-temporal/polyfill";

export function isIanaZone(timezone: string): boolean {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timezone);
    return true;
  } catch {
    return false;
  }
}
