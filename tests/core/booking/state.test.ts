import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  applyEvent,
  projectState,
  type BookingEvent,
  type BookingState,
} from "../../../src/core/booking/state";

function at(iso: string): Temporal.Instant {
  return Temporal.Instant.from(iso);
}

const startsAt = at("2027-02-01T10:00Z");
const endsAt = at("2027-02-01T10:30Z");

function state(overrides: Partial<BookingState> = {}): BookingState {
  return {
    status: "confirmed",
    startsAt,
    endsAt,
    hostUserIds: ["host-1"],
    inviteStatus: "none",
    ...overrides,
  };
}

const createdEvent: BookingEvent = {
  kind: "created",
  payload: { startsAt, endsAt, hostUserIds: ["host-1"] },
};
const rescheduledEvent: BookingEvent = {
  kind: "rescheduled",
  payload: { startsAt: at("2027-02-02T10:00Z"), endsAt: at("2027-02-02T10:30Z") },
};
const cancelledEvent: BookingEvent = { kind: "cancelled", payload: { reason: "invitee request" } };
const reassignedEvent: BookingEvent = { kind: "reassigned", payload: { hostUserIds: ["host-2"] } };
const noShowEvent: BookingEvent = { kind: "no_show", payload: {} };
const inviteSentEvent: BookingEvent = { kind: "invite_sent", payload: {} };
const inviteDeliveredEvent: BookingEvent = { kind: "invite_delivered", payload: {} };
const inviteFailedEvent: BookingEvent = { kind: "invite_failed", payload: { reason: "bounced" } };

describe("applyEvent: created", () => {
  test("from no prior state creates a confirmed booking", () => {
    const result = applyEvent(null, createdEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("confirmed");
    expect(result.value.startsAt.equals(startsAt)).toBe(true);
    expect(result.value.endsAt.equals(endsAt)).toBe(true);
    expect(result.value.hostUserIds).toEqual(["host-1"]);
    expect(result.value.inviteStatus).toBe("none");
  });

  test("cannot be created twice from confirmed", () => {
    const result = applyEvent(state({ status: "confirmed" }), createdEvent);
    expect(result).toEqual({ ok: false, error: { kind: "created", reason: "already_created" } });
  });

  test("cannot be created twice from cancelled", () => {
    const result = applyEvent(state({ status: "cancelled" }), createdEvent);
    expect(result).toEqual({ ok: false, error: { kind: "created", reason: "already_created" } });
  });

  test("cannot be created twice from no_show", () => {
    const result = applyEvent(state({ status: "no_show" }), createdEvent);
    expect(result).toEqual({ ok: false, error: { kind: "created", reason: "already_created" } });
  });
});

describe("applyEvent: rescheduled", () => {
  test("cannot reschedule before creation", () => {
    const result = applyEvent(null, rescheduledEvent);
    expect(result).toEqual({ ok: false, error: { kind: "rescheduled", reason: "not_created" } });
  });

  test("updates times from confirmed", () => {
    const result = applyEvent(state(), rescheduledEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.startsAt.equals(rescheduledEvent.payload.startsAt)).toBe(true);
    expect(result.value.endsAt.equals(rescheduledEvent.payload.endsAt)).toBe(true);
  });

  test("cannot reschedule after cancelled", () => {
    const result = applyEvent(state({ status: "cancelled" }), rescheduledEvent);
    expect(result).toEqual({ ok: false, error: { kind: "rescheduled", reason: "booking_cancelled" } });
  });

  test("cannot reschedule after no_show", () => {
    const result = applyEvent(state({ status: "no_show" }), rescheduledEvent);
    expect(result).toEqual({ ok: false, error: { kind: "rescheduled", reason: "booking_no_show" } });
  });
});

describe("applyEvent: cancelled", () => {
  test("cannot cancel before creation", () => {
    const result = applyEvent(null, cancelledEvent);
    expect(result).toEqual({ ok: false, error: { kind: "cancelled", reason: "not_created" } });
  });

  test("cancels a confirmed booking", () => {
    const result = applyEvent(state(), cancelledEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("cancelled");
  });

  test("cannot cancel twice", () => {
    const result = applyEvent(state({ status: "cancelled" }), cancelledEvent);
    expect(result).toEqual({ ok: false, error: { kind: "cancelled", reason: "already_cancelled" } });
  });

  test("cannot cancel a no_show booking", () => {
    const result = applyEvent(state({ status: "no_show" }), cancelledEvent);
    expect(result).toEqual({ ok: false, error: { kind: "cancelled", reason: "booking_no_show" } });
  });
});

describe("applyEvent: reassigned", () => {
  test("cannot reassign before creation", () => {
    const result = applyEvent(null, reassignedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "reassigned", reason: "not_created" } });
  });

  test("updates hosts from confirmed", () => {
    const result = applyEvent(state(), reassignedEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hostUserIds).toEqual(["host-2"]);
  });

  test("cannot reassign after cancelled", () => {
    const result = applyEvent(state({ status: "cancelled" }), reassignedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "reassigned", reason: "booking_cancelled" } });
  });

  test("cannot reassign after no_show", () => {
    const result = applyEvent(state({ status: "no_show" }), reassignedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "reassigned", reason: "booking_no_show" } });
  });
});

describe("applyEvent: no_show", () => {
  test("cannot mark no_show before creation", () => {
    const result = applyEvent(null, noShowEvent);
    expect(result).toEqual({ ok: false, error: { kind: "no_show", reason: "not_created" } });
  });

  test("marks a confirmed booking as no_show", () => {
    const result = applyEvent(state(), noShowEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("no_show");
  });

  test("cannot mark no_show after cancelled", () => {
    const result = applyEvent(state({ status: "cancelled" }), noShowEvent);
    expect(result).toEqual({ ok: false, error: { kind: "no_show", reason: "booking_cancelled" } });
  });

  test("cannot mark no_show twice", () => {
    const result = applyEvent(state({ status: "no_show" }), noShowEvent);
    expect(result).toEqual({ ok: false, error: { kind: "no_show", reason: "already_no_show" } });
  });
});

describe("applyEvent: invite_sent", () => {
  test("cannot send an invite before creation", () => {
    const result = applyEvent(null, inviteSentEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_sent", reason: "not_created" } });
  });

  test("sends from a confirmed booking with no prior invite", () => {
    const result = applyEvent(state({ inviteStatus: "none" }), inviteSentEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inviteStatus).toBe("sent");
  });

  test("resending is allowed", () => {
    const result = applyEvent(state({ inviteStatus: "sent" }), inviteSentEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inviteStatus).toBe("sent");
  });

  test("cannot send an invite after cancelled", () => {
    const result = applyEvent(state({ status: "cancelled" }), inviteSentEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_sent", reason: "booking_cancelled" } });
  });

  test("cannot send an invite after no_show", () => {
    const result = applyEvent(state({ status: "no_show" }), inviteSentEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_sent", reason: "booking_no_show" } });
  });
});

describe("applyEvent: invite_delivered", () => {
  test("cannot mark delivered before creation", () => {
    const result = applyEvent(null, inviteDeliveredEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_delivered", reason: "not_created" } });
  });

  test("cannot mark delivered before it was sent", () => {
    const result = applyEvent(state({ inviteStatus: "none" }), inviteDeliveredEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_delivered", reason: "invite_not_sent" } });
  });

  test("marks delivered after sent", () => {
    const result = applyEvent(state({ inviteStatus: "sent" }), inviteDeliveredEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inviteStatus).toBe("delivered");
  });

  test("cannot mark delivered after cancelled", () => {
    const result = applyEvent(state({ status: "cancelled", inviteStatus: "sent" }), inviteDeliveredEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_delivered", reason: "booking_cancelled" } });
  });

  test("cannot mark delivered after no_show", () => {
    const result = applyEvent(state({ status: "no_show", inviteStatus: "sent" }), inviteDeliveredEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_delivered", reason: "booking_no_show" } });
  });
});

describe("applyEvent: invite_failed", () => {
  test("cannot mark failed before creation", () => {
    const result = applyEvent(null, inviteFailedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_failed", reason: "not_created" } });
  });

  test("cannot mark failed before it was sent", () => {
    const result = applyEvent(state({ inviteStatus: "none" }), inviteFailedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_failed", reason: "invite_not_sent" } });
  });

  test("marks failed after sent", () => {
    const result = applyEvent(state({ inviteStatus: "sent" }), inviteFailedEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inviteStatus).toBe("failed");
  });

  test("cannot mark failed after cancelled", () => {
    const result = applyEvent(state({ status: "cancelled", inviteStatus: "sent" }), inviteFailedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_failed", reason: "booking_cancelled" } });
  });

  test("cannot mark failed after no_show", () => {
    const result = applyEvent(state({ status: "no_show", inviteStatus: "sent" }), inviteFailedEvent);
    expect(result).toEqual({ ok: false, error: { kind: "invite_failed", reason: "booking_no_show" } });
  });
});

describe("projectState", () => {
  test("empty history is an error, not an implicit fresh booking", () => {
    const result = projectState([]);
    expect(result).toEqual({ ok: false, error: { kind: null, reason: "empty_history" } });
  });

  test("folds a full valid history to the final state", () => {
    const result = projectState([createdEvent, rescheduledEvent, inviteSentEvent, inviteDeliveredEvent]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("confirmed");
    expect(result.value.startsAt.equals(rescheduledEvent.payload.startsAt)).toBe(true);
    expect(result.value.inviteStatus).toBe("delivered");
  });

  test("stops at the first illegal transition in a recorded history", () => {
    const result = projectState([createdEvent, cancelledEvent, rescheduledEvent]);
    expect(result).toEqual({ ok: false, error: { kind: "rescheduled", reason: "booking_cancelled" } });
  });
});
