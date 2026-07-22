import { err, ok, type Result } from "../lib/result";
import { mapEventToBusyChange, type BusyChange } from "./busy-mapping";
import type { EventsPage, GoogleApiError, ListEventsArgs } from "./google";

// Sync orchestration with injected I/O so tests run against fakes. The
// engine decides full vs incremental, walks pages, maps events to busy
// changes, and hands them to the repo. Every failure path ends in
// markUnhealthy: availability reads keep serving the stale cache, flagged.

export type SyncDeps = {
  listEvents: (args: ListEventsArgs) => Promise<Result<EventsPage, GoogleApiError>>;
  now: () => Date;
};

export type SyncRepo = {
  // full sync: atomically swap the connection's cache for `busy`
  replaceBusy(connectionId: string, busy: BusyChange[]): Promise<void>;
  // incremental: upsert by (connectionId, externalEventId), delete cancelled
  applyChanges(connectionId: string, changes: BusyChange[]): Promise<void>;
  saveSyncState(
    connectionId: string,
    state: { syncToken: string; lastSyncedAt: Date; fullSync: boolean },
  ): Promise<void>;
  markUnhealthy(connectionId: string): Promise<void>;
};

export type SyncConnection = {
  id: string;
  externalCalendarId: string;
  syncToken: string | null;
};

export type SyncOutcome = {
  mode: "full" | "incremental";
  changes: number;
};

export type SyncError =
  | { kind: "google"; error: GoogleApiError }
  | { kind: "no_sync_token"; message: string };

// Full sync window: starts slightly in the past so in-progress meetings
// still block, and MUST be bounded ahead — singleEvents with no timeMax
// expands recurring events unbounded (thousands of instances). The sync
// token freezes this window, so the sweep re-baselines with a fresh full
// sync (see FULL_RESYNC_AFTER_MS in src/jobs) long before the horizon
// (rollingWindowDays, ≤60d) reaches the window's edge.
const FULL_SYNC_LOOKBEHIND_MS = 24 * 60 * 60 * 1000;
export const FULL_SYNC_WINDOW_DAYS = 90;

export async function syncConnection(
  conn: SyncConnection,
  accessToken: string,
  deps: SyncDeps,
  repo: SyncRepo,
): Promise<Result<SyncOutcome, SyncError>> {
  const mode: SyncOutcome["mode"] = conn.syncToken ? "incremental" : "full";
  const result = await walkPages(conn, accessToken, deps, mode);

  if (!result.ok) {
    if (result.error.kind === "sync_token_expired") {
      // server invalidated the token: wipe and restart as full, once
      const fresh = await walkPages({ ...conn, syncToken: null }, accessToken, deps, "full");
      if (!fresh.ok) {
        await repo.markUnhealthy(conn.id);
        return err({ kind: "google", error: fresh.error });
      }
      return commit(conn.id, "full", fresh.value, deps, repo);
    }
    await repo.markUnhealthy(conn.id);
    return err({ kind: "google", error: result.error });
  }

  return commit(conn.id, mode, result.value, deps, repo);
}

type WalkResult = { changes: BusyChange[]; nextSyncToken?: string };

async function walkPages(
  conn: SyncConnection,
  accessToken: string,
  deps: SyncDeps,
  mode: SyncOutcome["mode"],
): Promise<Result<WalkResult, GoogleApiError>> {
  const changes: BusyChange[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const page = await deps.listEvents({
      accessToken,
      calendarId: conn.externalCalendarId,
      syncToken: mode === "incremental" ? (conn.syncToken ?? undefined) : undefined,
      timeMin:
        mode === "full"
          ? new Date(deps.now().getTime() - FULL_SYNC_LOOKBEHIND_MS).toISOString()
          : undefined,
      timeMax:
        mode === "full"
          ? new Date(deps.now().getTime() + FULL_SYNC_WINDOW_DAYS * 86_400_000).toISOString()
          : undefined,
      pageToken,
    });
    if (!page.ok) return page;

    const tz = page.value.timeZone ?? "UTC";
    for (const event of page.value.items) {
      const change = mapEventToBusyChange(event, tz);
      if (change) changes.push(change);
    }
    pageToken = page.value.nextPageToken;
    nextSyncToken = page.value.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return ok({ changes, nextSyncToken });
}

async function commit(
  connectionId: string,
  mode: SyncOutcome["mode"],
  walk: WalkResult,
  deps: SyncDeps,
  repo: SyncRepo,
): Promise<Result<SyncOutcome, SyncError>> {
  if (!walk.nextSyncToken) {
    // without a token the next run cannot be incremental; refuse to store
    // a state that would full-resync forever without flagging it
    await repo.markUnhealthy(connectionId);
    return err({ kind: "no_sync_token", message: "events.list returned no nextSyncToken" });
  }

  if (mode === "full") {
    await repo.replaceBusy(connectionId, walk.changes);
  } else {
    await repo.applyChanges(connectionId, walk.changes);
  }
  await repo.saveSyncState(connectionId, {
    syncToken: walk.nextSyncToken,
    lastSyncedAt: deps.now(),
    fullSync: mode === "full",
  });
  return ok({ mode, changes: walk.changes.length });
}
