import { describe, expect, test } from "bun:test";
import { getTableName, Table } from "drizzle-orm";
import * as schema from "../../src/db/schema";

const expectedTables: Record<string, string> = {
  users: "users",
  sessions: "sessions",
  apiTokens: "api_tokens",
  workspaces: "workspaces",
  workspaceMembers: "workspace_members",
  workspaceDomains: "workspace_domains",
  accounts: "accounts",
  verifications: "verifications",
  teams: "teams",
  teamMembers: "team_members",
  calendarConnections: "calendar_connections",
  calendarBusyCache: "calendar_busy_cache",
  schedules: "schedules",
  eventTypes: "event_types",
  eventTypeHosts: "event_type_hosts",
  holds: "holds",
  bookings: "bookings",
  bookingEvents: "booking_events",
  routingForms: "routing_forms",
  routingRules: "routing_rules",
  webhooks: "webhooks",
};

describe("schema", () => {
  for (const [exportName, tableName] of Object.entries(expectedTables)) {
    test(`exports table ${exportName}`, () => {
      const table = (schema as Record<string, unknown>)[exportName];
      expect(table).toBeDefined();
      expect(getTableName(table as Table)).toBe(tableName);
    });
  }

  test("exports the pg enums used by the tables", () => {
    expect(schema.bookingEventKind).toBeDefined();
    expect(schema.assignmentMode).toBeDefined();
    expect(schema.hostRole).toBeDefined();
    expect(schema.holdStatus).toBeDefined();
    expect(schema.workspacePlan).toBeDefined();
    expect(schema.domainStatus).toBeDefined();
  });
});
