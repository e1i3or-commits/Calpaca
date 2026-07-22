import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Dev: vite on :5173 proxies API calls to the Hono server on :3000.
// Prod: `bun run build:web` emits dist/web, which the Hono server serves
// itself — the SPA adds no second container.
export default defineConfig({
  // absolute root so `bun run dev:web` works from the repo root
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    // public endpoints are mounted at the API root, not /api
    proxy: Object.fromEntries(
      ["/api", "/health", "/availability", "/holds", "/bookings", "/routing", "/event-types"].map((p) => [
        p,
        "http://localhost:3000",
      ]),
    ),
  },
});
