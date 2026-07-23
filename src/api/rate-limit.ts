import type { MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { Temporal } from "@js-temporal/polyfill";
import type { RateLimitDecision } from "../core/ratelimit/window";

export interface ApiRateLimitDeps {
  readonly now: () => Temporal.Instant;
  readonly checkRateLimit?: (
    key: string,
    now: Temporal.Instant,
    limit: number,
    windowSeconds: number,
  ) => Promise<RateLimitDecision>;
}

function positiveEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientIp(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function createRateLimitMiddleware(
  deps: ApiRateLimitDeps,
  config: {
    scope: string;
    envName: string;
    defaultLimit: number;
    windowSeconds?: number;
  },
): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "POST" || !deps.checkRateLimit) return next();
    const windowSeconds = config.windowSeconds ?? 60;
    const decision = await deps.checkRateLimit(
      `${config.scope}:${clientIp(c)}`,
      deps.now(),
      positiveEnv(config.envName, config.defaultLimit),
      windowSeconds,
    );
    if (!decision.allowed) {
      return c.json(
        { error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds },
        429,
      );
    }
    return next();
  };
}

export function positiveIntegerEnv(name: string, fallback: number): number {
  return positiveEnv(name, fallback);
}
