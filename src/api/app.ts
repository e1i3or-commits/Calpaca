import { Hono } from "hono";
import { getAuth } from "../auth/index";
import { availabilityRoutes } from "./routes/availability";
import { bookingRoutes } from "./routes/bookings";
import { meRoutes } from "./routes/me";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// Temporary dev sign-in surface until the React scaffold lands. The OAuth
// flow must start in the browser: the sign-in POST sets a state cookie the
// callback validates against.
app.get("/dev/sign-in", (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>Dev sign-in</title>
<button id="go" style="font:16px sans-serif;padding:12px 24px">Sign in with Google</button>
<script>
document.getElementById("go").onclick = async () => {
  const res = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: "/dev/sign-in/done" }),
  });
  const { url } = await res.json();
  location.href = url;
};
</script>`),
);

app.get("/dev/sign-in/done", (c) => c.html("<p style='font:16px sans-serif'>Signed in. You can close this tab.</p>"));
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));
app.route("/", availabilityRoutes);
app.route("/", bookingRoutes);
app.route("/", meRoutes);
