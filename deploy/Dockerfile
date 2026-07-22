# Build stage: the web bundle needs dev deps (vite, tailwind); the runtime
# image keeps only production deps.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:web

FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
COPY --from=build /app/dist/web ./dist/web
EXPOSE 3000
# migrations are idempotent; running them on every boot keeps deploys one-step
CMD ["sh", "-c", "bunx drizzle-kit migrate && exec bun run src/index.ts"]
