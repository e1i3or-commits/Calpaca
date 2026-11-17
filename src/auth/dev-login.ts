const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Password sign-in for the seeded demo host. Requires an explicit opt-in and a
 * localhost auth URL, so a deployment can't turn it on by copying a dev env.
 */
export function isDevLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.CALPACA_DEV_LOGIN !== "1") return false;
  try {
    return LOCAL_HOSTS.has(new URL(env.BETTER_AUTH_URL ?? "").hostname);
  } catch {
    return false;
  }
}
