import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Temporal } from "@js-temporal/polyfill";
import {
  createAvailabilityRoutes,
  type AvailabilityDeps,
} from "../../src/api/routes/availability";
import { createSchedulerMcpServer } from "../../src/mcp/server";
import type {
  EventTypeConfig,
  EventTypeHostRecord,
  HostSchedule,
} from "../../src/db/availability-repo";

const NOW = Temporal.Instant.from("2027-01-04T00:00:00Z");
const START = "2027-01-04T00:00:00Z";
const END = "2027-01-05T00:00:00Z";

const eventTypes: Record<string, EventTypeConfig> = {
  "enabled-call": {
    id: "event-enabled",
    slug: "enabled-call",
    title: "Enabled call",
    durationMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minimumNoticeMin: 0,
    rollingWindowDays: 1,
    maxPerDay: null,
    curatedSlotCount: 3,
    publicSelectableHostIds: [],
    agentPolicy: { enabled: true },
  },
  "disabled-call": {
    id: "event-disabled",
    slug: "disabled-call",
    title: "Disabled call",
    durationMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minimumNoticeMin: 0,
    rollingWindowDays: 1,
    maxPerDay: null,
    curatedSlotCount: 3,
    publicSelectableHostIds: [],
    agentPolicy: { enabled: false },
  },
  "group-call": {
    id: "event-group",
    slug: "group-call",
    title: "Group call",
    durationMinutes: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minimumNoticeMin: 0,
    rollingWindowDays: 1,
    maxPerDay: null,
    curatedSlotCount: 3,
    publicSelectableHostIds: ["host-b", "host-c"],
    agentPolicy: { enabled: true },
  },
};

const hosts: Record<string, EventTypeHostRecord[]> = {
  "event-enabled": [{ userId: "host-a", role: "member", weight: 100 }],
  "event-disabled": [{ userId: "host-a", role: "member", weight: 100 }],
  "event-group": [
    { userId: "host-b", role: "required", weight: 100 },
    { userId: "host-c", role: "required", weight: 100 },
  ],
};

const schedules: Record<string, HostSchedule> = {
  "host-a": {
    userId: "host-a",
    timezone: "UTC",
    rules: [{ dow: 1, start: "09:00", end: "10:00" }],
  },
  "host-b": {
    userId: "host-b",
    timezone: "UTC",
    rules: [{ dow: 1, start: "09:00", end: "12:00" }],
  },
  "host-c": {
    userId: "host-c",
    timezone: "UTC",
    rules: [{ dow: 1, start: "11:00", end: "14:00" }],
  },
};

const clients: Client[] = [];
const servers: ReturnType<typeof createSchedulerMcpServer>[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function connect(deps: AvailabilityDeps): Promise<Client> {
  const app = createAvailabilityRoutes(deps);
  const appFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input.toString(), init);
    return app.fetch(request);
  }) as typeof fetch;
  const server = createSchedulerMcpServer({
    baseUrl: "http://scheduler.test",
    fetch: appFetch,
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  clients.push(client);
  servers.push(server);
  return client;
}

function deps(onUsers?: (userIds: readonly string[]) => void): AvailabilityDeps {
  return {
    getEventTypeBySlug: async (slug) => eventTypes[slug] ?? null,
    getEventTypeHosts: async (eventTypeId) => hosts[eventTypeId] ?? [],
    getEventTypeProfile: async () => ({
      teamName: null,
      hosts: [{ name: "Kai", image: null }],
    }),
    getSchedulesForUsers: async (userIds) => {
      onUsers?.(userIds);
      return userIds.flatMap((id) => {
        const schedule = schedules[id];
        return schedule ? [schedule] : [];
      });
    },
    getBusyForUsers: async () => [],
    now: () => NOW,
  };
}

describe("MCP read tools", () => {
  test("event metadata and availability round-trip through the public API", async () => {
    const client = await connect(deps());
    const meta = await client.callTool({
      name: "get_event_type",
      arguments: { slug: "enabled-call" },
    });
    const availability = await client.callTool({
      name: "query_availability",
      arguments: {
        eventTypeSlug: "enabled-call",
        start: START,
        end: END,
        inviteeTimezone: "America/New_York",
      },
    });

    expect(meta.isError).not.toBe(true);
    const metaBody = meta.structuredContent as Record<string, unknown>;
    expect(metaBody["title"]).toBe("Enabled call");
    expect(metaBody["profile"]).toEqual({
      teamName: null,
      hosts: [{ name: "Kai", image: null }],
    });

    expect(availability.isError).not.toBe(true);
    const availabilityBody = availability.structuredContent as Record<string, unknown>;
    const all = availabilityBody["all"] as {
      start: { utc: string; invitee: string };
    }[];
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]?.start.utc).toBe("2027-01-04T09:00:00Z");
    expect(all[0]?.start.invitee).toContain("[America/New_York]");
  });

  test("both tools refuse an event type whose agent policy is disabled", async () => {
    const client = await connect(deps());
    const meta = await client.callTool({
      name: "get_event_type",
      arguments: { slug: "disabled-call" },
    });
    const availability = await client.callTool({
      name: "query_availability",
      arguments: {
        eventTypeSlug: "disabled-call",
        start: START,
        end: END,
        inviteeTimezone: "UTC",
      },
    });

    expect(meta.isError).toBe(true);
    expect(JSON.stringify(meta.content)).toContain("disabled-call");
    expect(availability.isError).toBe(true);
    expect(JSON.stringify(availability.content)).toContain("disabled-call");
  });

  test("group query sends every selected host through the API", async () => {
    const seen: (readonly string[])[] = [];
    const client = await connect(deps((userIds) => seen.push(userIds)));
    const availability = await client.callTool({
      name: "query_availability",
      arguments: {
        eventTypeSlug: "group-call",
        start: START,
        end: END,
        inviteeTimezone: "UTC",
        hosts: ["host-b", "host-c"],
      },
    });

    expect(availability.isError).not.toBe(true);
    expect(seen).toEqual([["host-b", "host-c"]]);
    const availabilityBody = availability.structuredContent as Record<string, unknown>;
    const all = availabilityBody["all"] as {
      start: { utc: string };
    }[];
    expect(all[0]?.start.utc).toBe("2027-01-04T11:00:00Z");
  });
});
