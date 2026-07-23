import { describe, expect, test } from "bun:test";
import { app } from "../../src/api/app";

describe("booking embed headers", () => {
  test("public booking routes opt into framing", async () => {
    const response = await app.request("/book/intro-call");
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors *");
  });

  test("organizer routes do not opt into framing", async () => {
    const response = await app.request("/dashboard");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});
