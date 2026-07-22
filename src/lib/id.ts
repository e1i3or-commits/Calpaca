const SUFFIX_BYTES = 12;

function randomSuffix(): string {
  const bytes = new Uint8Array(SUFFIX_BYTES);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** Generates a URL-safe, unguessable token for reschedule/cancel links. */
export function generateToken(): string {
  return `${crypto.randomUUID()}-${randomSuffix()}`;
}
