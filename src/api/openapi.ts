import { Hono } from "hono";

type Method = "get" | "post" | "put" | "patch" | "delete";
type Operation = readonly [
  method: Method,
  path: string,
  tag: string,
  summary: string,
  auth?: "session" | "bearer" | "personal",
];

export const openApiOperations: readonly Operation[] = [
  ["get", "/health", "System", "Check service health"],
  ["get", "/openapi.json", "System", "Download the OpenAPI document"],
  ["get", "/event-types/{slug}", "Booking", "Get public event type metadata"],
  ["get", "/availability", "Booking", "List available and recommended slots"],
  ["post", "/holds", "Booking", "Temporarily hold one or more host slots"],
  ["post", "/bookings", "Booking", "Confirm a held booking"],
  ["get", "/bookings/{id}/reschedule-context", "Booking", "Get token-authorized reschedule context"],
  ["post", "/bookings/{id}/reschedule", "Booking", "Reschedule a booking"],
  ["post", "/bookings/{id}/cancel", "Booking", "Cancel a booking"],
  ["post", "/event-types/{slug}/suggestions", "Booking", "Suggest alternate meeting times"],
  ["post", "/invitee-calendar/connect", "Invitee calendar", "Start a short-lived Google free/busy connection"],
  ["get", "/api/invitee-calendar/callback", "Invitee calendar", "Complete Google OAuth and return to the booking page"],
  ["get", "/invitee-calendar/status", "Invitee calendar", "Check a calendar overlay capability"],
  ["delete", "/invitee-calendar/session", "Invitee calendar", "Disconnect and erase a calendar overlay"],
  ["get", "/polls/{publicId}", "Meeting polls", "Get a public meeting poll"],
  ["get", "/polls/{publicId}/response", "Meeting polls", "Get a token-authorized participant response"],
  ["post", "/polls/{publicId}/votes", "Meeting polls", "Create or update a participant response"],
  ["get", "/routing/{slug}", "Routing", "Get a public routing form"],
  ["post", "/routing/evaluate", "Routing", "Evaluate routing answers"],
  ["get", "/api/me/users", "Organizer", "List active users", "session"],
  ["get", "/api/me/profile", "Profile", "Get the current user profile", "personal"],
  ["patch", "/api/me/profile", "Profile", "Update the current user profile", "personal"],
  ["get", "/api/me/api-tokens", "Profile", "List personal API tokens", "session"],
  ["post", "/api/me/api-tokens", "Profile", "Create a personal API token", "session"],
  ["delete", "/api/me/api-tokens/{id}", "Profile", "Revoke a personal API token", "session"],
  ["get", "/api/me/workspace", "Workspace", "Get workspace plan, entitlements, and domains", "personal"],
  ["patch", "/api/me/workspace", "Workspace", "Update workspace settings", "personal"],
  ["post", "/api/me/workspace/domains", "Workspace", "Add a custom domain", "personal"],
  ["post", "/api/me/workspace/domains/{id}/verify", "Workspace", "Verify and provision a custom domain", "personal"],
  ["delete", "/api/me/workspace/domains/{id}", "Workspace", "Remove a custom domain", "personal"],
  ["get", "/api/me/bookings", "Organizer", "List organizer bookings", "session"],
  ["get", "/api/me/polls", "Meeting polls", "List workspace meeting polls", "session"],
  ["post", "/api/me/polls", "Meeting polls", "Create a meeting poll", "session"],
  ["get", "/api/me/polls/{id}", "Meeting polls", "Get meeting poll results", "session"],
  ["post", "/api/me/polls/{id}/finalize", "Meeting polls", "Finalize a meeting poll option", "session"],
  ["get", "/api/me/bookings/{id}", "Organizer", "Get booking detail and timeline", "session"],
  ["get", "/api/me/bookings/{id}/assignment", "Organizer", "Explain round-robin assignment", "session"],
  ["post", "/api/me/bookings/{id}/no-show", "Organizer", "Mark a booking as no-show", "session"],
  ["get", "/api/me/schedules", "Schedules", "List availability schedules", "session"],
  ["post", "/api/me/schedules", "Schedules", "Create an availability schedule", "session"],
  ["put", "/api/me/schedules/{id}", "Schedules", "Replace an availability schedule", "session"],
  ["delete", "/api/me/schedules/{id}", "Schedules", "Delete an availability schedule", "session"],
  ["get", "/api/me/teams", "Teams", "List visible teams", "session"],
  ["post", "/api/me/teams", "Teams", "Create a team", "session"],
  ["get", "/api/me/teams/{id}/members", "Teams", "List team members", "session"],
  ["post", "/api/me/teams/{id}/members", "Teams", "Add a team member", "session"],
  ["patch", "/api/me/teams/{id}/members/{userId}", "Teams", "Change a team member role", "session"],
  ["delete", "/api/me/teams/{id}/members/{userId}", "Teams", "Remove a team member", "session"],
  ["get", "/api/me/theme-options", "Event types", "List presentation options", "session"],
  ["get", "/api/me/event-types", "Event types", "List manageable event types", "session"],
  ["post", "/api/me/event-types", "Event types", "Create an event type", "session"],
  ["put", "/api/me/event-types/{id}", "Event types", "Replace an event type", "session"],
  ["delete", "/api/me/event-types/{id}", "Event types", "Delete an event type", "session"],
  ["get", "/api/me/calendars", "Calendars", "List Google calendars and connections", "session"],
  ["post", "/api/me/calendars/connections", "Calendars", "Connect a Google calendar", "session"],
  ["patch", "/api/me/calendars/connections/{id}", "Calendars", "Change conflict or write-destination settings", "session"],
  ["delete", "/api/me/calendars/connections/{id}", "Calendars", "Disconnect a calendar", "session"],
  ["get", "/api/me/routing-forms", "Routing", "List routing forms", "session"],
  ["post", "/api/me/routing-forms", "Routing", "Create a routing form", "session"],
  ["put", "/api/me/routing-forms/{id}", "Routing", "Replace a routing form", "session"],
  ["delete", "/api/me/routing-forms/{id}", "Routing", "Delete a routing form", "session"],
  ["get", "/api/me/analytics", "Analytics", "Get organizer analytics", "session"],
  ["get", "/api/me/analytics.csv", "Analytics", "Export organizer analytics as CSV", "session"],
  ["get", "/api/me/webhooks", "Webhooks", "List webhook endpoints", "session"],
  ["post", "/api/me/webhooks", "Webhooks", "Create a webhook endpoint", "session"],
  ["get", "/api/me/webhooks/{id}/deliveries", "Webhooks", "List webhook deliveries", "session"],
  ["patch", "/api/me/webhooks/{id}", "Webhooks", "Change webhook status", "session"],
  ["delete", "/api/me/webhooks/{id}", "Webhooks", "Delete a webhook endpoint", "session"],
  ["get", "/api/me/user-management", "Users", "Get the managed user directory", "session"],
  ["post", "/api/me/user-management/invitations", "Users", "Invite or reactivate a user", "session"],
  ["patch", "/api/me/user-management/users/{id}", "Users", "Change user role or status", "session"],
  ["delete", "/api/me/user-management/invitations/{id}", "Users", "Revoke a pending invitation", "session"],
  ["post", "/api/webhooks/google-calendar", "Provider webhooks", "Receive Google Calendar changes"],
  ["post", "/api/webhooks/email-delivery", "Provider webhooks", "Receive email delivery status", "bearer"],
];

function operationId(method: Method, path: string): string {
  return `${method}_${path}`
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character: string) => character.toUpperCase());
}

function parameters(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string", format: match[1] === "slug" ? undefined : "uuid" },
  }));
}

function queryParameters(path: string) {
  if (path === "/availability") {
    return [
      ["eventTypeSlug", true], ["start", true], ["end", true], ["inviteeTimezone", true],
      ["hosts", false], ["optionalHosts", false],
    ].map(([name, required]) => ({
      name,
      in: "query",
      required,
      schema: name === "hosts" || name === "optionalHosts"
        ? { type: "array", items: { type: "string", format: "uuid" } }
        : { type: "string" },
    }));
  }
  if (path === "/api/me/analytics" || path === "/api/me/analytics.csv") {
    return ["from", "to"].map((name) => ({
      name,
      in: "query",
      required: true,
      schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
    }));
  }
  return [];
}

export function generateOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, tag, summary, auth] of openApiOperations) {
    const body = !["get", "delete"].includes(method)
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { type: "object", additionalProperties: true } },
            },
          },
        }
      : {};
    paths[path] ??= {};
    paths[path]![method] = {
      operationId: operationId(method, path),
      tags: [tag],
      summary,
      parameters: [...parameters(path), ...queryParameters(path)],
      ...body,
      ...(auth
        ? {
            security: auth === "personal"
              ? [{ session: [] }, { personal: [] }]
              : [{ [auth]: [] }],
          }
        : {}),
      responses: {
        "200": {
          description: "Successful response",
          content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
        },
        "400": { $ref: "#/components/responses/BadRequest" },
        "401": { $ref: "#/components/responses/Unauthorized" },
        "404": { $ref: "#/components/responses/NotFound" },
        "409": { $ref: "#/components/responses/Conflict" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Calpaca API",
      version: "1.0.0",
      description: "Public booking, organizer administration, analytics, and webhook contracts.",
      license: {
        name: "GNU Affero General Public License v3.0",
        identifier: "AGPL-3.0-only",
      },
    },
    servers: [{ url: "/", description: "Current Calpaca installation" }],
    tags: [...new Set(openApiOperations.map((operation) => operation[2]))]
      .map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Organizer browser session established through Google sign-in.",
        },
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "Provider webhook secret configured by the operator.",
        },
        personal: {
          type: "http",
          scheme: "bearer",
          description: "Personal Calpaca API token or organizer browser session.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            issues: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
      },
      responses: Object.fromEntries([
        ["BadRequest", "Invalid request"],
        ["Unauthorized", "Authentication required"],
        ["NotFound", "Resource not found"],
        ["Conflict", "State conflict"],
      ].map(([name, description]) => [
        name,
        {
          description,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Error" } },
          },
        },
      ])),
    },
  };
}

export function openApiJson(): string {
  return `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`;
}

const referenceHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calpaca API reference</title><style>
:root{color-scheme:light;--bg:#f7f5f0;--card:#fffdf9;--text:#27231e;--muted:#746d63;--line:#ded8ce;--accent:#18794e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;border-bottom:1px solid var(--line);background:rgba(247,245,240,.94);backdrop-filter:blur(10px)}
.bar,main{width:min(1040px,calc(100% - 32px));margin:auto}.bar{display:flex;align-items:center;gap:20px;padding:18px 0}
h1{margin:0;font-size:20px;letter-spacing:-.03em}.bar input{margin-left:auto;width:min(360px,50%);padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:white}
main{padding:32px 0 64px}.tag{margin:28px 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
details{margin:8px 0;border:1px solid var(--line);border-radius:12px;background:var(--card)}summary{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;list-style:none}
.method{width:58px;color:var(--accent);font:700 12px ui-monospace,monospace}.path{font:600 14px ui-monospace,monospace}.summary{margin-left:auto;color:var(--muted)}
.content{border-top:1px solid var(--line);padding:16px}.content pre{overflow:auto;padding:14px;border-radius:8px;background:#231f1a;color:#f8f3eb;font-size:12px}
@media(max-width:640px){.bar{align-items:flex-start;flex-direction:column}.bar input{width:100%;margin:0}.summary{display:none}.path{font-size:12px;overflow-wrap:anywhere}}
</style></head><body><header><div class="bar"><h1>Calpaca API</h1><input id="search" type="search" placeholder="Search endpoints…" aria-label="Search endpoints"></div></header>
<main id="reference"><p>Loading API document…</p></main><script>
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
fetch("/openapi.json").then((response)=>response.json()).then((spec)=>{
 const main=document.querySelector("#reference");main.replaceChildren();
 const rows=[];for(const [path,item] of Object.entries(spec.paths)){for(const [method,operation] of Object.entries(item)){rows.push({path,method,operation})}}
 const render=(query="")=>{main.replaceChildren();let prior="";for(const row of rows.filter((row)=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))){const tag=row.operation.tags[0];if(tag!==prior){const title=document.createElement("h2");title.className="tag";title.textContent=tag;main.append(title);prior=tag}
 const detail=document.createElement("details");detail.innerHTML='<summary><span class="method">'+escapeHtml(row.method.toUpperCase())+'</span><span class="path">'+escapeHtml(row.path)+'</span><span class="summary">'+escapeHtml(row.operation.summary)+'</span></summary><div class="content"><p>'+escapeHtml(row.operation.summary)+'</p><pre>'+escapeHtml(JSON.stringify(row.operation,null,2))+'</pre></div>';main.append(detail)}};
 render();document.querySelector("#search").addEventListener("input",(event)=>render(event.target.value));
}).catch(()=>{document.querySelector("#reference").textContent="Could not load the API document."});
</script></body></html>`;

export const openApiRoutes = new Hono()
  .get("/openapi.json", (c) => c.body(openApiJson(), 200, {
    "content-type": "application/json; charset=utf-8",
  }))
  .get("/api-docs", (c) => c.html(referenceHtml));
