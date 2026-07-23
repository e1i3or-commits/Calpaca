export const EMBED_MESSAGE_TYPE = "calpaca:resize";
export const EMBED_MIN_HEIGHT = 420;
export const EMBED_MAX_HEIGHT = 1600;

export function parseBookingEmbedUrl(raw: string, base: string): URL | null {
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.pathname.startsWith("/book/") || url.pathname.length <= "/book/".length) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function embedResizeHeight(message: unknown): number | null {
  const candidate = message as { type?: unknown; height?: unknown } | null;
  if (
    !candidate
    || candidate.type !== EMBED_MESSAGE_TYPE
    || typeof candidate.height !== "number"
    || !Number.isFinite(candidate.height)
  ) return null;
  return Math.min(
    EMBED_MAX_HEIGHT,
    Math.max(EMBED_MIN_HEIGHT, Math.ceil(candidate.height)),
  );
}
