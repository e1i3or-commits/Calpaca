import { describe, expect, test } from "bun:test";
import {
  EMBED_MAX_HEIGHT,
  EMBED_MIN_HEIGHT,
  embedResizeHeight,
  parseBookingEmbedUrl,
} from "../../web/src/lib/embed";

describe("embed URL validation", () => {
  test("accepts absolute and same-site-relative booking URLs", () => {
    expect(
      parseBookingEmbedUrl("https://calendar.example/book/intro", "https://site.example")?.href,
    ).toBe("https://calendar.example/book/intro");
    expect(
      parseBookingEmbedUrl("/book/intro", "https://calendar.example/page")?.href,
    ).toBe("https://calendar.example/book/intro");
  });

  test("rejects non-web protocols and non-booking routes", () => {
    expect(parseBookingEmbedUrl("javascript:alert(1)", "https://site.example")).toBeNull();
    expect(parseBookingEmbedUrl("https://calendar.example/dashboard", "https://site.example")).toBeNull();
    expect(parseBookingEmbedUrl("https://calendar.example/book/", "https://site.example")).toBeNull();
    expect(parseBookingEmbedUrl("not a url", "not a base")).toBeNull();
  });
});

describe("embed resize messages", () => {
  test("rounds and clamps valid heights", () => {
    expect(embedResizeHeight({ type: "calpaca:resize", height: 781.2 })).toBe(782);
    expect(embedResizeHeight({ type: "calpaca:resize", height: 10 })).toBe(EMBED_MIN_HEIGHT);
    expect(embedResizeHeight({ type: "calpaca:resize", height: 9999 })).toBe(EMBED_MAX_HEIGHT);
  });

  test("rejects malformed and non-finite messages", () => {
    expect(embedResizeHeight({ type: "other", height: 700 })).toBeNull();
    expect(embedResizeHeight({ type: "calpaca:resize", height: "700" })).toBeNull();
    expect(embedResizeHeight({ type: "calpaca:resize", height: Number.NaN })).toBeNull();
  });
});
