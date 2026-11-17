import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { version: string };

// Each build gets a fresh id; open tabs compare theirs to /version.json to offer a refresh.
const buildId = randomUUID();
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3000";

// Dev: vite on :5173 proxies API calls to the Hono server at API_ORIGIN (default :3000).
// Prod: `bun run build:web` emits dist/web, which the Hono server serves
// itself — the SPA adds no second container.
export default defineConfig({
  // absolute root so `bun run dev:web` works from the repo root
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "release-manifest",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ buildId }) });
      },
    },
  ],
  define: {
    __CALPACA_VERSION__: JSON.stringify(packageJson.version),
    __CALPACA_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // the engine ships TypeScript source inside the workspace; the browser
      // bundle compiles it directly instead of needing a prebuilt dist/
      "@calpaca/core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        embed: fileURLToPath(new URL("./src/embed.ts", import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "embed" ? "embed.js" : "assets/[name]-[hash].js",
      },
    },
  },
  server: {
    // public endpoints are mounted at the API root, not /api
    proxy: Object.fromEntries(
      // "^/version$" is anchored so the static /version.json build manifest isn't proxied.
      ["/api", "/health", "^/version$", "/availability", "/booking-page", "/holds", "/bookings", "/routing", "/event-types", "/polls"].map((p) => [
        p,
        apiOrigin,
      ]),
    ),
  },
});
