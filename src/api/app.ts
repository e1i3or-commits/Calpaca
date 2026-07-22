import { Hono } from "hono";
import { availabilityRoutes } from "./routes/availability";
import { bookingRoutes } from "./routes/bookings";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/", availabilityRoutes);
app.route("/", bookingRoutes);
