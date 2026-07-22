import { app } from "./api/app";
import { startJobs } from "./jobs/index";

// In-process workers share the server's lifetime; DISABLE_JOBS opts out for
// one-off scripts that import the app.
if (!process.env.DISABLE_JOBS) {
  startJobs().catch((e) => console.error("[jobs] failed to start:", e));
}

export default {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  fetch: app.fetch,
};
