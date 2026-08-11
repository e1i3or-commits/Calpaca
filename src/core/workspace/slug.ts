import { err, ok, type Result } from "../../lib/result";

/** Hosted public links put the workspace slug in the path
 * (`/book/<workspace>/<event-type>`, `/booking/<workspace>`), so a slug that
 * collides with a sibling path segment would shadow a real route. "p" is the
 * dangerous one: `/booking/p/<page>` already means a custom booking page. */
export const RESERVED_WORKSPACE_SLUGS: readonly string[] = [
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "book",
  "booking",
  "cancel",
  "dashboard",
  "dev",
  "docs",
  "embed",
  "health",
  "new",
  "offer",
  "onboarding",
  "p",
  "poll",
  "privacy",
  "proposal",
  "public",
  "r",
  "reschedule",
  "settings",
  "sign-in",
  "sign-out",
  "signup",
  "static",
  "support",
  "terms",
  "www",
];

export const WORKSPACE_SLUG_MIN_LENGTH = 3;
export const WORKSPACE_SLUG_MAX_LENGTH = 40;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Two accepted shapes: what `generatedWorkspaceSlug` produces now (12 hex
// characters), and the raw `randomUUID().slice(0, 12)` form that earlier hosted
// sign-ups stored, which keeps the UUID's hyphen at position 8. Those existing
// workspaces must still be recognized as unclaimed, or their owners are never
// asked to pick a real link.
const GENERATED_SLUG_RE = /^workspace-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{3})$/;

export type WorkspaceSlugError =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "reserved";

/** Lowercases, strips accents, and collapses anything that is not a-z0-9 into
 * single hyphens. Used both to normalize what a host types and to derive a
 * first suggestion from their name — never to decide validity on its own. */
export function normalizeWorkspaceSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function validateWorkspaceSlug(
  input: string,
): Result<string, WorkspaceSlugError> {
  const slug = normalizeWorkspaceSlug(input);
  if (slug.length === 0) return err(input.trim().length === 0 ? "empty" : "invalid_characters");
  if (!SLUG_RE.test(slug)) return err("invalid_characters");
  // Reserved before length: the short reserved segments ("p", "r") are rejected
  // by the length floor too, and "too short" would explain the wrong problem.
  if (RESERVED_WORKSPACE_SLUGS.includes(slug)) return err("reserved");
  if (slug.length < WORKSPACE_SLUG_MIN_LENGTH) return err("too_short");
  if (slug.length > WORKSPACE_SLUG_MAX_LENGTH) return err("too_long");
  return ok(slug);
}

/** True for the placeholder slug `ensureWorkspaceForUser` mints on first hosted
 * sign-in. Those are unusable as a public URL, which is what makes claiming a
 * real slug a required onboarding step rather than a nicety. */
export function isGeneratedWorkspaceSlug(slug: string): boolean {
  return GENERATED_SLUG_RE.test(slug);
}

/** Builds that placeholder. The random part is a parameter so this stays pure
 * and so the generator and `isGeneratedWorkspaceSlug` cannot drift apart —
 * they did once, and the result was that nobody was asked to claim a link. */
export function generatedWorkspaceSlug(random: string): string {
  return `workspace-${random.replace(/-/g, "").slice(0, 12)}`;
}

/** Best first guess for the slug field: the workspace or personal name when it
 * normalizes to something legal, else the email local part. Returns null when
 * neither yields a valid slug so the caller leaves the field empty rather than
 * prefilling something the host must delete. */
export function suggestWorkspaceSlug(
  input: { name?: string | null; email?: string | null },
): string | null {
  const candidates = [
    input.name ?? "",
    (input.email ?? "").split("@")[0] ?? "",
  ];
  for (const candidate of candidates) {
    const validated = validateWorkspaceSlug(candidate);
    if (validated.ok) return validated.value;
  }
  return null;
}
