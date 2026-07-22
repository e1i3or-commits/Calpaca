import { Hono } from "hono";
import { getAuth } from "../auth/index";
import { adminRoutes } from "./routes/admin";
import { availabilityRoutes } from "./routes/availability";
import { bookingRoutes } from "./routes/bookings";
import { meRoutes } from "./routes/me";
import { webhookAdminRoutes } from "./routes/webhook-admin";
import { webhookRoutes } from "./routes/webhooks";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
app.route("/", availabilityRoutes);
app.route("/", bookingRoutes);
app.route("/", meRoutes);
app.route("/", adminRoutes);
app.route("/", webhookAdminRoutes);
app.route("/", webhookRoutes);
