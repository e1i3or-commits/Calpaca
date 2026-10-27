import { z } from "zod";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const bookingWindowSchema = z.object({
  timezone: z.string().refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }, "Choose a valid timezone"),
  startDate: z.string().date().nullable(),
  endDate: z.string().date().nullable(),
  weeklyWindows: z.array(z.object({
    dow: z.number().int().min(0).max(6), start: time, end: time,
  }).refine((rule) => rule.start < rule.end, "End time must be after start time")).max(50).nullable(),
  excludedDates: z.array(z.string().date()).max(100),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
  "End date must be on or after start date");
export type BookingWindow = z.infer<typeof bookingWindowSchema>;
