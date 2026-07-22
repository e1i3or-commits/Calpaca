import { serveStatic } from "hono/bun";
import { app } from "./api/app";
import { startJobs } from "./jobs/index";

// In-process workers share the server's lifetime; DISABLE_JOBS opts out for
// one-off scripts that import the app.
if (!process.env.DISABLE_JOBS) {
  startJobs().catch((e) => console.error("[jobs] failed to start:", e));
}

// Serve the built SPA (dist/web) from the same process: Hono + Postgres is
// the whole deployment. Registered here, not in app.ts, so tests hit the
// pure API surface. Unmatched GETs fall back to index.html for client routes.
app.get("*", serveStatic({ root: "./dist/web" }));
app.get("*", serveStatic({ path: "./dist/web/index.html" }));

export default {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  fetch: app.fetch,
};
