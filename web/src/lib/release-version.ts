export const RELEASE_MANIFEST_PATH = "/version.json";
export const RELEASE_CHECK_INTERVAL_MS = 60_000;

const BUILD_ID = /^[a-f0-9-]{36}$/;

/** True only for a well-formed manifest naming a different build, rollbacks included. */
export function hasNewRelease(current: string, manifest: unknown): boolean {
  if (typeof manifest !== "object" || manifest === null || !("buildId" in manifest)) return false;
  const { buildId } = manifest;
  return typeof buildId === "string" && BUILD_ID.test(buildId) && buildId !== current;
}
