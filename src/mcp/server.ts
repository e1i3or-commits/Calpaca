import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CALPACA_VERSION } from "../version";

export interface SchedulerMcpDeps {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
}

type JsonObject = Record<string, unknown>;

const getEventTypeInput = z.object({
  slug: z.string().min(1).describe("Public event type slug"),
});

const queryAvailabilityInput = z.object({
  eventTypeSlug: z.string().min(1),
  start: z.string().min(1).describe("UTC ISO window start"),
  end: z.string().min(1).describe("UTC ISO window end"),
  inviteeTimezone: z.string().min(1).describe("IANA timezone"),
  hosts: z.array(z.string().min(1)).optional(),
});

const createHoldInput = z.object({
  eventTypeSlug: z.string().min(1),
  start: z.string().min(1).describe("UTC ISO slot start"),
  end: z.string().min(1).describe("UTC ISO slot end"),
  hosts: z.array(z.string().min(1)).optional(),
});

const confirmBookingInput = z.object({
  eventTypeSlug: z.string().min(1),
  holdIds: z.array(z.string().min(1)).min(1),
  invitee: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    timezone: z.string().min(1).describe("IANA timezone"),
    notes: z.string().max(2000).optional(),
  }),
});

const rescheduleBookingInput = z.object({
  bookingId: z.string().min(1),
  rescheduleToken: z.string().min(1),
  start: z.string().min(1).describe("UTC ISO slot start"),
  end: z.string().min(1).describe("UTC ISO slot end"),
});

const cancelBookingInput = z.object({
  bookingId: z.string().min(1),
  cancelToken: z.string().min(1),
  reason: z.string().optional(),
});

function result(value: JsonObject) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

type ToolResponse = ReturnType<typeof result> | ReturnType<typeof toolError>;

type RegisterTool = (
  name: string,
  config: {
    readonly description: string;
    readonly inputSchema: z.ZodTypeAny;
  },
  handler: (args: unknown) => Promise<ToolResponse>,
) => unknown;

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function getJson(
  deps: SchedulerMcpDeps,
  path: string,
): Promise<{ ok: true; value: JsonObject } | { ok: false; error: string }> {
  try {
    const response = await deps.fetch(apiUrl(deps.baseUrl, path));
    const body = (await response.json().catch(() => null)) as JsonObject | null;
    if (!response.ok) {
      const code = typeof body?.["error"] === "string" ? body["error"] : `http_${response.status}`;
      return { ok: false, error: code };
    }
    if (!body) return { ok: false, error: "invalid_api_response" };
    return { ok: true, value: body };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "api_request_failed",
    };
  }
}

async function postJson(
  deps: SchedulerMcpDeps,
  path: string,
  body: JsonObject,
): Promise<{ ok: true; value: JsonObject } | { ok: false; error: string }> {
  try {
    const response = await deps.fetch(apiUrl(deps.baseUrl, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as JsonObject | null;
    if (!response.ok) {
      const code =
        typeof responseBody?.["error"] === "string"
          ? responseBody["error"]
          : `http_${response.status}`;
      return { ok: false, error: code };
    }
    if (!responseBody) return { ok: false, error: "invalid_api_response" };
    return { ok: true, value: responseBody };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "api_request_failed",
    };
  }
}

async function enabledEventType(
  deps: SchedulerMcpDeps,
  slug: string,
): Promise<{ ok: true; value: JsonObject } | { ok: false; error: string }> {
  const meta = await getJson(deps, `/event-types/${encodeURIComponent(slug)}`);
  if (!meta.ok) return meta;
  const policy = meta.value["agentPolicy"];
  const enabled =
    typeof policy === "object" &&
    policy !== null &&
    (policy as JsonObject)["enabled"] === true;
  if (!enabled) {
    return {
      ok: false,
      error: `Agent access is disabled for event type "${slug}".`,
    };
  }
  return meta;
}

export function createSchedulerMcpServer(deps: SchedulerMcpDeps): McpServer {
  const server = new McpServer({
    name: "calpaca",
    version: CALPACA_VERSION,
  });
  // SDK 1.29's Zod 3 compatibility type recursively expands under TS 5.7.
  // Runtime validation is unaffected; handlers parse with the same schema.
  const registerTool = server.registerTool.bind(server) as unknown as RegisterTool;

  registerTool(
    "get_event_type",
    {
      description: "Get public metadata for an agent-enabled event type.",
      inputSchema: getEventTypeInput,
    },
    async (args) => {
      const { slug } = getEventTypeInput.parse(args);
      const meta = await enabledEventType(deps, slug);
      return meta.ok ? result(meta.value) : toolError(meta.error);
    },
  );

  registerTool(
    "query_availability",
    {
      description:
        "Query scored availability with UTC and invitee-timezone renderings.",
      inputSchema: queryAvailabilityInput,
    },
    async (args) => {
      const { eventTypeSlug, start, end, inviteeTimezone, hosts } =
        queryAvailabilityInput.parse(args);
      const meta = await enabledEventType(deps, eventTypeSlug);
      if (!meta.ok) return toolError(meta.error);

      const query = new URLSearchParams({
        eventTypeSlug,
        start,
        end,
        inviteeTimezone,
      });
      for (const host of hosts ?? []) query.append("hosts", host);
      const availability = await getJson(
        deps,
        `/availability?${query.toString()}`,
      );
      return availability.ok
        ? result(availability.value)
        : toolError(availability.error);
    },
  );

  registerTool(
    "create_hold",
    {
      description: "Temporarily hold an available slot for an agent-enabled event type.",
      inputSchema: createHoldInput,
    },
    async (args) => {
      const input = createHoldInput.parse(args);
      const response = await postJson(deps, "/holds", {
        ...input,
        agent: true,
      });
      return response.ok ? result(response.value) : toolError(response.error);
    },
  );

  registerTool(
    "confirm_booking",
    {
      description: "Confirm active holds and create a booking.",
      inputSchema: confirmBookingInput,
    },
    async (args) => {
      const input = confirmBookingInput.parse(args);
      const response = await postJson(deps, "/bookings", {
        ...input,
        agent: true,
      });
      return response.ok ? result(response.value) : toolError(response.error);
    },
  );

  registerTool(
    "reschedule_booking",
    {
      description: "Move a booking using its reschedule token.",
      inputSchema: rescheduleBookingInput,
    },
    async (args) => {
      const { bookingId, ...body } = rescheduleBookingInput.parse(args);
      const response = await postJson(
        deps,
        `/bookings/${encodeURIComponent(bookingId)}/reschedule`,
        { ...body, agent: true },
      );
      return response.ok ? result(response.value) : toolError(response.error);
    },
  );

  registerTool(
    "cancel_booking",
    {
      description: "Cancel a booking using its cancellation token.",
      inputSchema: cancelBookingInput,
    },
    async (args) => {
      const { bookingId, ...body } = cancelBookingInput.parse(args);
      const response = await postJson(
        deps,
        `/bookings/${encodeURIComponent(bookingId)}/cancel`,
        { ...body, agent: true },
      );
      return response.ok ? result(response.value) : toolError(response.error);
    },
  );

  return server;
}
