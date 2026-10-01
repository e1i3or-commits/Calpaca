import { z } from "zod";
export const oneOffMeetingInput = z.object({
  requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  durationMinutes: z.number().int().min(15).max(180).multipleOf(5),
  attendees: z.array(z.object({ userId: z.string().uuid(), role: z.enum(["required", "optional"]) }).strict()).min(1).max(30),
}).strict().refine(value => new Set(value.attendees.map(person => person.userId)).size === value.attendees.length, "Choose each attendee once");
export type OneOffMeetingInput = z.infer<typeof oneOffMeetingInput>;
