import { describe, expect, test } from "bun:test";
import { Temporal } from "@js-temporal/polyfill";
import { composeOfferSnippet, offerSlotUrl } from "../../../src/core/invite/offer-snippet";

const OFFER_URL = "https://app.calpaca.io/offer/abc123";

function slot(startUtc: string, minutes = 30) {
  const start = Temporal.Instant.from(startUtc);
  return { start, end: start.add({ minutes }) };
}

describe("offerSlotUrl", () => {
  test("adds the slot as a query parameter", () => {
    const url = offerSlotUrl(OFFER_URL, Temporal.Instant.from("2026-07-29T18:00:00Z"));
    expect(url).toBe(`${OFFER_URL}?slot=2026-07-29T18%3A00%3A00Z`);
  });

  test("appends rather than starting a second query string", () => {
    const url = offerSlotUrl(`${OFFER_URL}?ref=email`, Temporal.Instant.from("2026-07-29T18:00:00Z"));
    expect(url).toContain("?ref=email&slot=");
    expect(url.match(/\?/g)).toHaveLength(1);
  });

  test("the round trip survives decoding", () => {
    const start = Temporal.Instant.from("2026-07-29T18:30:00Z");
    const value = new URL(offerSlotUrl(OFFER_URL, start)).searchParams.get("slot");
    expect(Temporal.Instant.from(value!).equals(start)).toBe(true);
  });
});

describe("composeOfferSnippet", () => {
  const slots = [
    slot("2026-07-29T18:00:00Z"),
    slot("2026-07-30T13:30:00Z"),
  ];

  test("renders one link per slot, in the host's zone with a zone name", () => {
    const { html } = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots,
      timezone: "America/New_York",
    });
    // 18:00Z is 2:00 PM EDT on that date.
    expect(html).toContain("Wednesday, July 29 · 2:00 PM EDT");
    expect(html).toContain("Thursday, July 30 · 9:30 AM EDT");
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('href="https://app.calpaca.io/offer/abc123?slot=2026-07-29T18%3A00%3A00Z"');
  });

  test("the same instant renders in whatever zone the host writes from", () => {
    const pacific = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots: [slots[0]!],
      timezone: "America/Los_Angeles",
    });
    expect(pacific.html).toContain("11:00 AM PDT");
    expect(pacific.html).not.toContain("2:00 PM");
  });

  test("plain text spells the URL out, because a link cannot be clicked there", () => {
    const { text } = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots,
      timezone: "America/New_York",
    });
    expect(text).toContain("Wednesday, July 29 · 2:00 PM EDT");
    expect(text).toContain("https://app.calpaca.io/offer/abc123?slot=2026-07-29T18%3A00%3A00Z");
    expect(text).not.toContain("<a");
    expect(text).not.toContain("<div");
  });

  test("a single slot uses singular copy", () => {
    const one = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots: [slots[0]!],
      timezone: "America/New_York",
    });
    expect(one.text).toContain("Click the time to book it.");
    expect(one.text).not.toContain("whichever");
  });

  test("several slots use plural copy", () => {
    const many = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots,
      timezone: "America/New_York",
    });
    expect(many.text).toContain("Click whichever time works to book it.");
  });

  test("escapes markup so a crafted URL cannot inject an attribute or tag", () => {
    const { html } = composeOfferSnippet({
      offerUrl: 'https://x.test/offer/a"><img src=x onerror=alert(1)>',
      slots: [slots[0]!],
      timezone: "UTC",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&quot;&gt;&lt;img");
  });

  test("no slots yields no links and still says nothing misleading", () => {
    const { html, text } = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots: [],
      timezone: "UTC",
    });
    expect(html).not.toContain("<a ");
    expect(text.trim()).not.toContain("http");
  });

  // A snippet built the evening before a spring-forward must not silently
  // shift the next morning's times by an hour.
  test("times either side of a DST transition each carry their own offset", () => {
    const { text } = composeOfferSnippet({
      offerUrl: OFFER_URL,
      slots: [
        slot("2026-03-08T05:00:00Z"), // 12:00 AM EST, before the 2am jump
        slot("2026-03-08T17:00:00Z"), // 1:00 PM EDT, after it
      ],
      timezone: "America/New_York",
    });
    expect(text).toContain("12:00 AM EST");
    expect(text).toContain("1:00 PM EDT");
  });
});
