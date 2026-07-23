import { Hono } from "hono";
import { getAuth } from "../auth/index";
import { adminRoutes } from "./routes/admin";
import { analyticsRoutes } from "./routes/analytics";
import { availabilityRoutes } from "./routes/availability";
import { bookingRoutes } from "./routes/bookings";
import { meRoutes } from "./routes/me";
import { routingRoutes } from "./routes/routing";
import { webhookAdminRoutes } from "./routes/webhook-admin";
import { webhookRoutes } from "./routes/webhooks";
import { suggestionRoutes } from "./routes/suggestions";
import { userManagementRoutes } from "./routes/user-management";

export const app = new Hono();

app.use("/book/*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "frame-ancestors *");
});

app.get("/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
app.route("/", availabilityRoutes);
app.route("/", bookingRoutes);
app.route("/", meRoutes);
app.route("/", adminRoutes);
app.route("/", analyticsRoutes);
app.route("/", routingRoutes);
app.route("/", webhookAdminRoutes);
app.route("/", webhookRoutes);
app.route("/", suggestionRoutes);
app.route("/", userManagementRoutes);
