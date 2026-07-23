import { Hono } from "hono";
import { getAuth } from "../auth/index";
import { adminRoutes } from "./routes/admin";
import { analyticsRoutes } from "./routes/analytics";
import { availabilityRoutes } from "./routes/availability";
import { bookingRoutes } from "./routes/bookings";
import { meRoutes } from "./routes/me";
import { openApiRoutes } from "./openapi";
import { profileRoutes } from "./routes/profile";
import { routingRoutes } from "./routes/routing";
import { webhookAdminRoutes } from "./routes/webhook-admin";
import { webhookRoutes } from "./routes/webhooks";
import { suggestionRoutes } from "./routes/suggestions";
import { userManagementRoutes } from "./routes/user-management";
import { workspaceRoutes } from "./routes/workspace";
import { inviteeCalendarRoutes } from "./routes/invitee-calendar";
import { requestHostname } from "./public-workspace";

export const app = new Hono();

// Organizer OAuth must begin on the same canonical origin that receives the
// callback. Custom-domain cookies cannot be read by app.calpaca.io, which
// would make BetterAuth reject the returned state.
app.use("/sign-in", async (c, next) => {
  const configured = process.env.BETTER_AUTH_URL;
  if (process.env.CALPACA_DEPLOYMENT_MODE === "hosted" && configured) {
    const organizerOrigin = new URL(configured);
    if (requestHostname(c).replace(/:\d+$/, "") !== organizerOrigin.hostname) {
      const target = new URL(`${c.req.path}${new URL(c.req.url).search}`, organizerOrigin);
      return c.redirect(target.toString());
    }
  }
  await next();
});

app.use("/book/*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "frame-ancestors *");
});

app.get("/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
app.route("/", availabilityRoutes);
app.route("/", bookingRoutes);
app.route("/", meRoutes);
app.route("/", openApiRoutes);
app.route("/", profileRoutes);
app.route("/", adminRoutes);
app.route("/", analyticsRoutes);
app.route("/", routingRoutes);
app.route("/", webhookAdminRoutes);
app.route("/", webhookRoutes);
app.route("/", suggestionRoutes);
app.route("/", userManagementRoutes);
app.route("/", workspaceRoutes);
app.route("/", inviteeCalendarRoutes);
