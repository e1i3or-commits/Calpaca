import type { WorkspaceDomain } from "./api";

/** Where this workspace's public links live. A verified custom hostname wins
 * (it keeps the short `/book/<event-type>` form), then the hosted namespace
 * which needs the workspace slug in the path, then the current origin for a
 * self-hosted install. Mirrors the precedence in docs/HOSTED.md. */
export function bookingBaseUrl(input: {
  workspaceSlug: string;
  domains: readonly WorkspaceDomain[];
  deploymentMode: "hosted" | "self_hosted";
  origin: string;
  hostedOrigin?: string;
}): string {
  const verified = input.domains.filter((domain) => domain.status === "verified");
  const custom = verified.find((domain) => domain.isPrimary) ?? verified[0];
  if (custom) return `https://${custom.hostname}`;
  if (input.deploymentMode === "hosted") {
    const hosted = input.hostedOrigin ?? "https://calpaca.io";
    return `${hosted}/book/${input.workspaceSlug}`;
  }
  return input.origin;
}

/** A base already carrying `/book/<workspace>` takes the event-type slug
 * directly; every other base needs the `/book/` segment added. */
export function eventTypeBookingUrl(base: string, slug: string): string {
  return base.includes("/book/") ? `${base}/${slug}` : `${base}/book/${slug}`;
}

export function bookingPageUrl(base: string): string {
  return base.includes("/book/")
    ? base.replace("/book/", "/booking/")
    : `${base}/booking`;
}
