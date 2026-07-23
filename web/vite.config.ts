import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { version: string };

// Dev: vite on :5173 proxies API calls to the Hono server on :3000.
// Prod: `bun run build:web` emits dist/web, which the Hono server serves
// itself — the SPA adds no second container.
export default defineConfig({
  // absolute root so `bun run dev:web` works from the repo root
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  define: {
    __CALPACA_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
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
      ["/api", "/health", "/version", "/availability", "/holds", "/bookings", "/routing", "/event-types", "/polls"].map((p) => [
        p,
        "http://localhost:3000",
      ]),
    ),
  },
});
