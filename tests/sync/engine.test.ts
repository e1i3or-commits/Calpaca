import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "../../src/lib/result";
import type { BusyChange } from "../../src/sync/busy-mapping";
import { syncConnection, type SyncRepo } from "../../src/sync/engine";
import type { EventsPage, GoogleApiError, ListEventsArgs } from "../../src/sync/google";

const NOW = new Date("2026-07-22T12:00:00Z");
const CONN = { id: "conn-1", externalCalendarId: "primary", syncToken: null };

function fakeRepo() {
  const calls: { method: string; args: unknown[] }[] = [];
  const repo: SyncRepo = {
    replaceBusy: async (...args) => void calls.push({ method: "replaceBusy", args }),
    applyChanges: async (...args) => void calls.push({ method: "applyChanges", args }),
    saveSyncState: async (...args) => void calls.push({ method: "saveSyncState", args }),
    markUnhealthy: async (...args) => void calls.push({ method: "markUnhealthy", args }),
  };
  return { repo, calls };
}

// scripted listEvents: shifts one response per call, records requests
function fakeList(responses: Result<EventsPage, GoogleApiError>[]) {
  const requests: ListEventsArgs[] = [];
  return {
    requests,
    listEvents: async (args: ListEventsArgs) => {
      requests.push(args);
      const next = responses.shift();
      if (!next) throw new Error("fakeList exhausted");
      return next;
    },
  };
}

const busyEvent = (id: string) => ({
  id,
  status: "confirmed",
  start: { dateTime: "2026-07-23T10:00:00Z" },
  end: { dateTime: "2026-07-23T11:00:00Z" },
});

describe("syncConnection", () => {
  test("full sync: sends bounded timeMin/timeMax not syncToken, replaces busy, stores token", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents, requests } = fakeList([
      ok({ items: [busyEvent("a")], timeZone: "America/New_York", nextSyncToken: "tok-1" }),
    ]);

    const result = await syncConnection(CONN, "at", { listEvents, now: () => NOW }, repo);

    expect(result).toEqual(ok({ mode: "full", changes: 1 }));
    expect(requests[0]!.syncToken).toBeUndefined();
    expect(requests[0]!.timeMin).toBe("2026-07-21T12:00:00.000Z"); // now - 24h
    // window must be bounded: unbounded + singleEvents expands recurring
    // events without limit
    expect(requests[0]!.timeMax).toBe("2026-10-20T12:00:00.000Z"); // now + 90d
    expect(calls.map((c) => c.method)).toEqual(["replaceBusy", "saveSyncState"]);
    expect(calls[1]!.args[1]).toEqual({ syncToken: "tok-1", lastSyncedAt: NOW, fullSync: true });
  });

  test("incremental sync: sends stored syncToken, applies changes", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents, requests } = fakeList([
      ok({
        items: [busyEvent("a"), { id: "b", status: "cancelled" }],
        nextSyncToken: "tok-2",
      }),
    ]);

    const result = await syncConnection(
      { ...CONN, syncToken: "tok-1" },
      "at",
      { listEvents, now: () => NOW },
      repo,
    );

    expect(result).toEqual(ok({ mode: "incremental", changes: 2 }));
    expect(requests[0]!.syncToken).toBe("tok-1");
    expect(requests[0]!.timeMin).toBeUndefined();
    expect(requests[0]!.timeMax).toBeUndefined();
    expect(calls.map((c) => c.method)).toEqual(["applyChanges", "saveSyncState"]);
    expect(calls[1]!.args[1]).toEqual({ syncToken: "tok-2", lastSyncedAt: NOW, fullSync: false });
    const changes = calls[0]!.args[1] as BusyChange[];
    expect(changes.map((c) => c.kind)).toEqual(["upsert", "delete"]);
  });

  test("paginates until nextSyncToken, aggregating changes across pages", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents, requests } = fakeList([
      ok({ items: [busyEvent("a")], nextPageToken: "page-2" }),
      ok({ items: [busyEvent("b")], nextSyncToken: "tok-3" }),
    ]);

    const result = await syncConnection(CONN, "at", { listEvents, now: () => NOW }, repo);

    expect(result).toEqual(ok({ mode: "full", changes: 2 }));
    expect(requests).toHaveLength(2);
    expect(requests[1]!.pageToken).toBe("page-2");
    const busy = calls[0]!.args[1] as BusyChange[];
    expect(busy.map((c) => (c.kind === "upsert" ? c.externalEventId : ""))).toEqual(["a", "b"]);
  });

  test("410 sync_token_expired wipes and restarts as full sync", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents, requests } = fakeList([
      err<GoogleApiError, EventsPage>({ kind: "sync_token_expired", status: 410, message: "gone" }),
      ok({ items: [busyEvent("a")], nextSyncToken: "tok-fresh" }),
    ]);

    const result = await syncConnection(
      { ...CONN, syncToken: "stale" },
      "at",
      { listEvents, now: () => NOW },
      repo,
    );

    expect(result).toEqual(ok({ mode: "full", changes: 1 }));
    expect(requests[0]!.syncToken).toBe("stale");
    expect(requests[1]!.syncToken).toBeUndefined();
    expect(requests[1]!.timeMin).toBeDefined();
    // full resync replaces the cache wholesale; nothing marked unhealthy
    expect(calls.map((c) => c.method)).toEqual(["replaceBusy", "saveSyncState"]);
    expect(calls[1]!.args[1]).toEqual({ syncToken: "tok-fresh", lastSyncedAt: NOW, fullSync: true });
  });

  test("google failure marks connection unhealthy and keeps stale cache", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents } = fakeList([
      err<GoogleApiError, EventsPage>({ kind: "http_error", status: 500, message: "boom" }),
    ]);

    const result = await syncConnection(CONN, "at", { listEvents, now: () => NOW }, repo);

    expect(result.ok).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["markUnhealthy"]);
  });

  test("failure during the post-410 full resync also marks unhealthy", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents } = fakeList([
      err<GoogleApiError, EventsPage>({ kind: "sync_token_expired", status: 410, message: "gone" }),
      err<GoogleApiError, EventsPage>({ kind: "network_error", message: "offline" }),
    ]);

    const result = await syncConnection(
      { ...CONN, syncToken: "stale" },
      "at",
      { listEvents, now: () => NOW },
      repo,
    );

    expect(result.ok).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["markUnhealthy"]);
  });

  test("missing nextSyncToken is flagged, not silently accepted", async () => {
    const { repo, calls } = fakeRepo();
    const { listEvents } = fakeList([ok({ items: [busyEvent("a")] })]);

    const result = await syncConnection(CONN, "at", { listEvents, now: () => NOW }, repo);

    expect(result.ok).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["markUnhealthy"]);
  });
});
