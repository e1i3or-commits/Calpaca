import { describe, expect, test } from "bun:test";
import {
  generatedWorkspaceSlug,
  isGeneratedWorkspaceSlug,
  normalizeWorkspaceSlug,
  RESERVED_WORKSPACE_SLUGS,
  suggestWorkspaceSlug,
  validateWorkspaceSlug,
} from "../../../src/core/workspace/slug";

describe("normalizeWorkspaceSlug", () => {
  test("lowercases and collapses separators into single hyphens", () => {
    expect(normalizeWorkspaceSlug("  TourScale   Leadership  ")).toBe("tourscale-leadership");
    expect(normalizeWorkspaceSlug("Kai's Calendar!!")).toBe("kai-s-calendar");
    expect(normalizeWorkspaceSlug("a__b--c")).toBe("a-b-c");
  });

  test("strips diacritics instead of splitting the word on them", () => {
    expect(normalizeWorkspaceSlug("naïve")).toBe("naive");
    expect(normalizeWorkspaceSlug("Café Böhm")).toBe("cafe-bohm");
  });

  test("yields an empty string when nothing survives normalization", () => {
    expect(normalizeWorkspaceSlug("!!!")).toBe("");
    expect(normalizeWorkspaceSlug("   ")).toBe("");
  });
});

describe("validateWorkspaceSlug", () => {
  test("accepts a normalized slug and returns the normalized form", () => {
    const result = validateWorkspaceSlug("  TourScale Leadership ");
    expect(result).toEqual({ ok: true, value: "tourscale-leadership" });
  });

  test("distinguishes empty input from input with no usable characters", () => {
    expect(validateWorkspaceSlug("   ")).toEqual({ ok: false, error: "empty" });
    expect(validateWorkspaceSlug("!!!")).toEqual({ ok: false, error: "invalid_characters" });
  });

  test("enforces the length band", () => {
    expect(validateWorkspaceSlug("ab")).toEqual({ ok: false, error: "too_short" });
    expect(validateWorkspaceSlug("a".repeat(41))).toEqual({ ok: false, error: "too_long" });
    expect(validateWorkspaceSlug("a".repeat(40)).ok).toBe(true);
  });

  // A workspace slug sits in the same path position as /booking/p/<page>, so
  // claiming "p" would shadow every custom booking page.
  test("rejects slugs that would shadow a public route segment", () => {
    for (const reserved of ["p", "book", "booking", "r", "api", "app"]) {
      expect(validateWorkspaceSlug(reserved)).toEqual({ ok: false, error: "reserved" });
    }
  });

  test("the reserved list contains the public path segments in use today", () => {
    for (const segment of ["book", "booking", "r", "p", "reschedule", "cancel", "poll", "offer", "proposal", "signup"]) {
      expect(RESERVED_WORKSPACE_SLUGS).toContain(segment);
    }
  });
});

describe("isGeneratedWorkspaceSlug", () => {
  test("recognizes the placeholder minted on first hosted sign-in", () => {
    expect(isGeneratedWorkspaceSlug("workspace-0a1b2c3d4e5f")).toBe(true);
  });

  // Regression: the detector once required 12 unbroken hex characters while the
  // generator used randomUUID().slice(0, 12), which keeps the UUID's hyphen.
  // Every hosted workspace therefore looked already-claimed and no new customer
  // was ever asked to pick a real link.
  test("recognizes the legacy uuid-slice form that kept the hyphen", () => {
    expect(isGeneratedWorkspaceSlug("workspace-bdf6adcd-333")).toBe(true);
  });

  test("agrees with the generator for any uuid it is given", () => {
    const uuids = [
      "bdf6adcd-3331-4c0f-9c4e-2b7e5a1d9f00",
      "00000000-0000-4000-8000-000000000000",
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    ];
    for (const uuid of uuids) {
      const slug = generatedWorkspaceSlug(uuid);
      expect(isGeneratedWorkspaceSlug(slug)).toBe(true);
      // The placeholder must also survive validation, or claiming a real slug
      // would be the only way to have a legal workspace at all.
      expect(validateWorkspaceSlug(slug)).toEqual({ ok: true, value: slug });
    }
  });

  test("treats a host-chosen slug as claimed even when it starts with workspace", () => {
    expect(isGeneratedWorkspaceSlug("workspace-tourscale")).toBe(false);
    expect(isGeneratedWorkspaceSlug("tourscale")).toBe(false);
    expect(isGeneratedWorkspaceSlug("workspace-0a1b2c3d4e5")).toBe(false);
  });
});

describe("suggestWorkspaceSlug", () => {
  test("prefers the name, falling back to the email local part", () => {
    expect(suggestWorkspaceSlug({ name: "TourScale", email: "kai@tourscale.com" })).toBe("tourscale");
    expect(suggestWorkspaceSlug({ name: "!!", email: "kai.kaapro@tourscale.com" }))
      .toBe("kai-kaapro");
  });

  test("returns null rather than prefilling something illegal", () => {
    expect(suggestWorkspaceSlug({ name: "ok", email: "p@x.test" })).toBeNull();
    expect(suggestWorkspaceSlug({ name: null, email: null })).toBeNull();
  });
});
