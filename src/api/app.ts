import { Hono } from "hono";
import { availabilityRoutes } from "./routes/availability";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/", availabilityRoutes);
